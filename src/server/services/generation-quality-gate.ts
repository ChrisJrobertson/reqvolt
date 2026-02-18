/**
 * Post-generation quality gate.
 * Runs self-review, coherence check, and deterministic checks.
 * Does NOT block pack delivery — if AI calls fail, pack goes through.
 */
import { db } from "../db";
import Anthropic from "@anthropic-ai/sdk";
import { getModelForTask, trackModelUsage } from "@/lib/ai/model-router";
import { buildReviewUserPrompt, type ReviewStory } from "../prompts/generation-review";
import { buildCoherenceCheckPrompt } from "../prompts/coherence-check";
import { ConfidenceLevel } from "@prisma/client";

const anthropic = new Anthropic();

export interface ReviewIssue {
  storyIndex: number;
  acIndex?: number;
  issueType: string;
  description: string;
  suggestedFix?: string;
  severity: string;
}

export interface MissedRequirement {
  topic: string;
  sourceEvidence: string;
  suggestion: string;
}

export interface OffTopicStory {
  index: number;
  reason: string;
}

export interface QualityReport {
  confidenceScore: number;
  confidenceLevel: "high" | "moderate" | "low";
  selfReview: {
    overallAssessment: "strong" | "acceptable" | "weak";
    issueCount: number;
    issues: ReviewIssue[];
    missedRequirements: MissedRequirement[];
  };
  evidenceCoverage: {
    percentage: number;
    status: "strong" | "moderate" | "weak";
    acsWithoutEvidence: number;
  };
  coherence: {
    isCoherent: boolean;
    offTopicStories: OffTopicStory[];
  };
  assumptions: {
    percentage: number;
    status: "low" | "moderate" | "high";
    count: number;
  };
  qaPassRate: {
    percentage: number;
    totalFlags: number;
    errorFlags: number;
    warningFlags: number;
  };
  duplicates: {
    pairs: Array<{ storyIndexA: number; storyIndexB: number; similarity: number }>;
  };
}

export async function assessGenerationQuality(
  packId: string,
  packVersionId: string,
  workspaceId: string,
  options?: { topics?: Array<{ topic: string; depth?: string }> }
): Promise<QualityReport | null> {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId },
  });
  if (!workspace) return null;

  const version = await db.packVersion.findFirst({
    where: { id: packVersionId, pack: { id: packId, workspaceId } },
    include: {
      stories: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          acceptanceCriteria: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      pack: true,
    },
  });
  if (!version) return null;

  const sourceIds = (version.sourceIds as string[]) ?? [];
  const sourceChunks = await db.sourceChunk.findMany({
    where: { sourceId: { in: sourceIds } },
    orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
    include: { source: { select: { name: true, type: true } } },
  });

  const sourceChunksContent = sourceChunks
    .map((c) => `[chunk:${c.id}]\n${c.content}`)
    .join("\n\n");

  const acIds = version.stories.flatMap((s) => s.acceptanceCriteria.map((ac) => ac.id));
  const evidenceLinks = await db.evidenceLink.findMany({
    where: { entityType: "acceptance_criteria", entityId: { in: acIds } },
  });

  const qaFlags = await db.qAFlag.findMany({
    where: { packVersionId },
  });

  // Evidence coverage (deterministic)
  const totalAcs = acIds.length;
  const acsWithDirectEvidence = new Set(
    evidenceLinks.filter((l) => l.confidence === "high").map((l) => l.entityId)
  ).size;
  const acsWithAnyEvidence = new Set(evidenceLinks.map((l) => l.entityId)).size;
  const evidencePct = totalAcs > 0 ? (acsWithDirectEvidence / totalAcs) * 100 : 100;
  const evidenceStatus: "strong" | "moderate" | "weak" =
    evidencePct > 70 ? "strong" : evidencePct > 50 ? "moderate" : "weak";
  const acsWithoutEvidence = totalAcs - acsWithAnyEvidence;

  // Assumption ratio (we don't have confidence on ACs in DB - use evidence coverage as proxy)
  const assumptionPct = totalAcs > 0 ? ((totalAcs - acsWithDirectEvidence) / totalAcs) * 100 : 0;
  const assumptionStatus: "low" | "moderate" | "high" =
    assumptionPct > 40 ? "high" : assumptionPct > 20 ? "moderate" : "low";

  // QA pass rate
  const storiesWithFlags = new Set(qaFlags.map((f) => f.entityId)).size;
  const totalStories = version.stories.length;
  const qaPassRate = totalStories > 0 ? ((totalStories - storiesWithFlags) / totalStories) * 100 : 100;
  const errorFlags = qaFlags.filter((f) => f.severity === "high").length;
  const warningFlags = qaFlags.filter((f) => f.severity === "medium").length;

  let selfReviewResult: {
    overallAssessment: "strong" | "acceptable" | "weak";
    issues: ReviewIssue[];
    missedRequirements: MissedRequirement[];
    confidenceScore: number;
  } = {
    overallAssessment: "acceptable",
    issues: [],
    missedRequirements: [],
    confidenceScore: 70,
  };

  let coherenceResult: { isCoherent: boolean; offTopicStories: OffTopicStory[] } = {
    isCoherent: true,
    offTopicStories: [],
  };

  const topics = options?.topics ?? [];

  // STEP 1: Self-Review (Sonnet) - skip if disabled
  if (workspace.aiSelfReviewEnabled) {
    try {
      const storiesForReview: ReviewStory[] = version.stories.map((s) => ({
        persona: s.persona,
        want: s.want,
        benefit: s.soThat,
        soThat: s.soThat,
        acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
          given: ac.given,
          when: ac.when,
          then: ac.then,
        })),
      }));

      const start = Date.now();
      const model = getModelForTask("self_review");
      const response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: buildReviewUserPrompt(storiesForReview, sourceChunksContent),
          },
        ],
      });

      await trackModelUsage({
        workspaceId,
        model,
        task: "self_review",
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs: Date.now() - start,
        packId,
      });

      const textContent = response.content.find((c) => c.type === "text");
      const rawText = typeof textContent === "object" && "text" in textContent ? textContent.text : "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          overallAssessment?: "strong" | "acceptable" | "weak";
          storyReviews?: Array<{
            storyIndex: number;
            issues?: Array<{
              acIndex: number;
              issueType: string;
              description: string;
              suggestedFix?: string;
              severity: string;
            }>;
          }>;
          missedRequirements?: MissedRequirement[];
          confidenceScore?: number;
        };
        selfReviewResult = {
          overallAssessment: parsed.overallAssessment ?? "acceptable",
          issues:
            parsed.storyReviews?.flatMap((sr) =>
              (sr.issues ?? []).map((i) => ({
                storyIndex: sr.storyIndex,
                acIndex: i.acIndex,
                issueType: i.issueType,
                description: i.description,
                suggestedFix: i.suggestedFix,
                severity: i.severity,
              }))
            ) ?? [],
          missedRequirements: parsed.missedRequirements ?? [],
          confidenceScore: parsed.confidenceScore ?? 70,
        };

        // Apply corrections: downgrade hallucinated evidence, add QA flags, add missed requirements
        for (const issue of selfReviewResult.issues.filter((i) => i.severity === "error")) {
          const story = version.stories[issue.storyIndex];
          if (story && issue.acIndex !== undefined) {
            const ac = story.acceptanceCriteria[issue.acIndex];
            if (ac) {
              const links = await db.evidenceLink.findMany({
                where: { entityType: "acceptance_criteria", entityId: ac.id },
              });
              for (const link of links) {
                await db.evidenceLink.update({
                  where: { id: link.id },
                  data: { confidence: "low" as ConfidenceLevel },
                });
              }
              await db.qAFlag.create({
                data: {
                  packVersionId,
                  entityType: "acceptance_criteria",
                  entityId: ac.id,
                  ruleCode: "WEAK_EVIDENCE_ONLY",
                  severity: "high",
                  message: issue.description,
                  suggestedFix: issue.suggestedFix ?? undefined,
                },
              });
            }
          }
        }

        const existingOq = (version.openQuestions as object[]) ?? [];
        const newOq = selfReviewResult.missedRequirements.map((m) => ({
          question: m.suggestion,
          context: m.sourceEvidence,
          suggestedOwner: "product owner",
        }));
        if (newOq.length > 0) {
          await db.packVersion.update({
            where: { id: packVersionId },
            data: { openQuestions: [...existingOq, ...newOq] as object[] },
          });
        }
      }
    } catch (err) {
      console.warn("[generation-quality-gate] Self-review failed:", err);
    }
  }

  // STEP 2: Coherence check (Haiku) - only if we have topics
  if (topics.length > 0 && workspace.aiTopicExtractionEnabled) {
    try {
      const storyTitles = version.stories.map((s) => ({ persona: s.persona, want: s.want }));
      const { system, user } = buildCoherenceCheckPrompt(topics, storyTitles);
      const start = Date.now();
      const model = getModelForTask("coherence_check");
      const response = await anthropic.messages.create({
        model,
        max_tokens: 512,
        messages: [{ role: "user", content: `${system}\n\n${user}` }],
      });

      await trackModelUsage({
        workspaceId,
        model,
        task: "coherence_check",
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs: Date.now() - start,
        packId,
      });

      const textContent = response.content.find((c) => c.type === "text");
      const rawText = typeof textContent === "object" && "text" in textContent ? textContent.text : "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          coherent?: boolean;
          offTopicStories?: OffTopicStory[];
        };
        coherenceResult = {
          isCoherent: parsed.coherent ?? true,
          offTopicStories: parsed.offTopicStories ?? [],
        };
      }
    } catch (err) {
      console.warn("[generation-quality-gate] Coherence check failed:", err);
    }
  }

  // Duplicate detection - simplified (no embeddings on stories, skip for now)
  const duplicatePairs: Array<{ storyIndexA: number; storyIndexB: number; similarity: number }> = [];

  // Aggregate confidence score
  const selfReviewScore = selfReviewResult.confidenceScore;
  const coherenceScore = coherenceResult.isCoherent
    ? coherenceResult.offTopicStories.length === 0
      ? 100
      : 50
    : 0;
  const assumptionPenalty = 100 - assumptionPct;

  const confidenceScore = Math.round(
    selfReviewScore * 0.35 +
      evidencePct * 0.25 +
      qaPassRate * 0.2 +
      coherenceScore * 0.1 +
      Math.min(100, assumptionPenalty) * 0.1
  );
  const clampedScore = Math.max(0, Math.min(100, confidenceScore));
  const confidenceLevel: "high" | "moderate" | "low" =
    clampedScore >= 85 ? "high" : clampedScore >= 65 ? "moderate" : "low";

  const report: QualityReport = {
    confidenceScore: clampedScore,
    confidenceLevel,
    selfReview: {
      overallAssessment: selfReviewResult.overallAssessment,
      issueCount: selfReviewResult.issues.length,
      issues: selfReviewResult.issues,
      missedRequirements: selfReviewResult.missedRequirements,
    },
    evidenceCoverage: {
      percentage: evidencePct,
      status: evidenceStatus,
      acsWithoutEvidence,
    },
    coherence: coherenceResult,
    assumptions: {
      percentage: assumptionPct,
      status: assumptionStatus,
      count: Math.round((assumptionPct / 100) * totalAcs),
    },
    qaPassRate: {
      percentage: qaPassRate,
      totalFlags: qaFlags.length,
      errorFlags: errorFlags,
      warningFlags: warningFlags,
    },
    duplicates: { pairs: duplicatePairs },
  };

  await db.packVersion.update({
    where: { id: packVersionId },
    data: {
      generationConfidence: report as unknown as object,
      confidenceScore: clampedScore,
      confidenceLevel,
      selfReviewRun: workspace.aiSelfReviewEnabled,
      selfReviewPassed: selfReviewResult.overallAssessment !== "weak",
    },
  });

  return report;
}
