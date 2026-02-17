import { db } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { embedText } from "@/server/services/embedding";
import { inngest } from "@/server/inngest/client";
import {
  getAnalysisClient,
  getCachedAIControls,
  getGenerationClient,
} from "@/lib/ai/model-router";
import {
  buildCoherenceCheckPrompt,
  COHERENCE_CHECK_SYSTEM_PROMPT,
} from "@/lib/prompts/coherence-check";
import { buildReviewUserPrompt, REVIEW_SYSTEM_PROMPT } from "@/lib/prompts/generation-review";
import type {
  MissedRequirement,
  OffTopicStory,
  QualityReport,
  ReviewIssue,
  StoryReview,
} from "@/lib/quality/types";

interface SelfReviewResponse {
  overallAssessment?: "strong" | "acceptable" | "weak";
  storyReviews?: StoryReview[];
  missedRequirements?: MissedRequirement[];
  confidenceScore?: number;
}

interface CoherenceResponse {
  coherent?: boolean;
  offTopicStories?: OffTopicStory[];
}

function parseJsonObject<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : raw;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function parseJsonArray<T>(raw: string): T[] {
  const match = raw.match(/\[[\s\S]*\]/);
  const json = match ? match[0] : raw;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getConfidenceLevel(score: number): "high" | "moderate" | "low" {
  if (score >= 85) return "high";
  if (score >= 65) return "moderate";
  return "low";
}

function getCoverageStatus(percentage: number): "strong" | "moderate" | "weak" {
  if (percentage > 70) return "strong";
  if (percentage >= 50) return "moderate";
  return "weak";
}

function getAssumptionStatus(percentage: number): "low" | "moderate" | "high" {
  if (percentage > 40) return "high";
  if (percentage >= 20) return "moderate";
  return "low";
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i]! * vecB[i]!;
    normA += vecA[i]! ** 2;
    normB += vecB[i]! ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function mapIssueToQaRule(
  issueType: ReviewIssue["issueType"]
): "VAGUE_TERM" | "UNTESTABLE" | "OVERLOADED_AC" | "MISSING_CLAUSE" {
  if (issueType === "overloaded") return "OVERLOADED_AC";
  if (issueType === "hallucination" || issueType === "untestable") return "UNTESTABLE";
  return "VAGUE_TERM";
}

async function extractTopicCoverageFromSources(input: {
  workspaceId: string;
  userId?: string;
  packId: string;
  sourceIds: string[];
  sourceChunks: Array<{ id: string; content: string }>;
}) {
  const analysisClient = getAnalysisClient();
  const text = input.sourceChunks
    .map((chunk) => `[chunk:${chunk.id}] ${chunk.content}`)
    .join("\n\n")
    .slice(0, 16000);
  const response = await analysisClient.call({
    workspaceId: input.workspaceId,
    userId: input.userId,
    packId: input.packId,
    task: "topic_extraction",
    systemPrompt:
      "You are a requirements analyst. Identify the distinct topics covered in the provided source material. Return ONLY a JSON array of objects, no other text. UK English.",
    userPrompt:
      `Analyse the following source material and identify the distinct requirement topics covered.\n` +
      `For each topic, estimate depth and chunk count.\n\n${text}\n\n` +
      `Return only JSON array with { topic, depth, chunkCount }.`,
    sourceIds: input.sourceIds,
    sourceChunksSent: input.sourceChunks.length,
  });
  if (response.skipped) return [];
  const list = parseJsonArray<{ topic?: string; depth?: string; chunkCount?: number }>(
    response.text
  );
  return list
    .filter((item) => item.topic && item.depth)
    .map((item) => ({
      topic: item.topic!,
      depth: item.depth!,
      chunkCount: Number(item.chunkCount ?? 0),
    }));
}

export async function assessGenerationQuality(
  packId: string,
  packVersionId: string
): Promise<QualityReport> {
  const version = await db.packVersion.findFirst({
    where: { id: packVersionId, packId },
    include: {
      pack: { select: { id: true, workspaceId: true } },
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
      qaFlags: { where: { resolvedBy: null } },
    },
  });
  if (!version) throw new Error("Pack version not found");

  const sourceIds = (version.sourceIds as string[] | null) ?? [];
  const sourceChunks = await db.sourceChunk.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { id: true, sourceId: true, content: true },
    orderBy: { chunkIndex: "asc" },
  });

  const storyIds = version.stories.map((story) => story.id);
  const acIds = version.stories.flatMap((story) => story.acceptanceCriteria.map((ac) => ac.id));
  const evidenceLinks = await db.evidenceLink.findMany({
    where: {
      entityType: { in: ["story", "acceptance_criteria"] },
      entityId: { in: [...storyIds, ...acIds] },
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      sourceChunkId: true,
      confidence: true,
    },
  });

  const evidenceByAc = new Map<string, typeof evidenceLinks>();
  const evidenceByStory = new Map<string, typeof evidenceLinks>();
  for (const link of evidenceLinks) {
    if (link.entityType === "acceptance_criteria") {
      const list = evidenceByAc.get(link.entityId) ?? [];
      list.push(link);
      evidenceByAc.set(link.entityId, list);
    } else {
      const list = evidenceByStory.get(link.entityId) ?? [];
      list.push(link);
      evidenceByStory.set(link.entityId, list);
    }
  }

  const storiesForReview = version.stories.map((story) => ({
    persona: story.persona,
    want: story.want,
    benefit: story.soThat,
    acceptanceCriteria: story.acceptanceCriteria.map((ac) => {
      const refs = (evidenceByAc.get(ac.id) ?? []).map((link) => link.sourceChunkId);
      const strongest: "direct" | "inferred" | "assumption" =
        refs.length === 0
          ? "assumption"
          : (evidenceByAc.get(ac.id) ?? []).some((link) => link.confidence === "high")
            ? "direct"
            : (evidenceByAc.get(ac.id) ?? []).some((link) => link.confidence === "medium")
              ? "inferred"
              : "assumption";
      return {
        given: ac.given,
        when: ac.when,
        then: ac.then,
        source_references: refs,
        confidence: strongest,
      };
    }),
  }));

  const generationClient = getGenerationClient();
  const analysisClient = getAnalysisClient();

  const [selfReviewResult, coherenceResult] = await Promise.allSettled([
    generationClient.call({
      workspaceId: version.pack.workspaceId,
      packId: version.pack.id,
      task: "self_review",
      systemPrompt: REVIEW_SYSTEM_PROMPT,
      userPrompt: buildReviewUserPrompt(
        storiesForReview,
        sourceChunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
        }))
      ),
      sourceIds,
      sourceChunksSent: sourceChunks.length,
      maxTokens: 2200,
    }),
    (async () => {
      const topics = await extractTopicCoverageFromSources({
        workspaceId: version.pack.workspaceId,
        packId: version.pack.id,
        sourceIds,
        sourceChunks,
      });
      return analysisClient.call({
        workspaceId: version.pack.workspaceId,
        packId: version.pack.id,
        task: "coherence_check",
        systemPrompt: COHERENCE_CHECK_SYSTEM_PROMPT,
        userPrompt: buildCoherenceCheckPrompt(
          topics.map((topic) => ({
            topic: topic.topic,
            depth:
              topic.depth === "minimal" ||
              topic.depth === "mentioned" ||
              topic.depth === "moderate" ||
              topic.depth === "detailed"
                ? topic.depth
                : "mentioned",
            chunkCount: topic.chunkCount,
          })),
          version.stories.map((story) => ({ persona: story.persona, want: story.want }))
        ),
        sourceIds,
        sourceChunksSent: sourceChunks.length,
        maxTokens: 900,
      });
    })(),
  ]);

  const selfReviewCall = selfReviewResult.status === "fulfilled" ? selfReviewResult.value : null;
  const coherenceCall = coherenceResult.status === "fulfilled" ? coherenceResult.value : null;

  const parsedSelfReview =
    selfReviewCall && !selfReviewCall.skipped
      ? parseJsonObject<SelfReviewResponse>(selfReviewCall.text)
      : null;
  const parsedCoherence =
    coherenceCall && !coherenceCall.skipped
      ? parseJsonObject<CoherenceResponse>(coherenceCall.text)
      : null;

  // Step 3: evidence coverage.
  const allAcs = version.stories.flatMap((story) => story.acceptanceCriteria);
  const acCount = allAcs.length || 1;
  const acWithDirectEvidence = allAcs.filter((ac) =>
    (evidenceByAc.get(ac.id) ?? []).some((link) => link.confidence === "high")
  ).length;
  const acsWithoutEvidence = allAcs.filter((ac) => (evidenceByAc.get(ac.id) ?? []).length === 0).length;
  const evidenceCoveragePercentage = Math.round((acWithDirectEvidence / acCount) * 100);

  // Step 4: assumption ratio.
  const assumptionCount = allAcs.filter((ac) => {
    const links = evidenceByAc.get(ac.id) ?? [];
    if (links.length === 0) return true;
    return !links.some((link) => link.confidence === "high");
  }).length;
  const assumptionPercentage = Math.round((assumptionCount / acCount) * 100);

  // Step 5: QA pass rate.
  const storyIdByAcId = new Map<string, string>();
  for (const story of version.stories) {
    for (const ac of story.acceptanceCriteria) {
      storyIdByAcId.set(ac.id, story.id);
    }
  }
  const flaggedStoryIds = new Set<string>();
  for (const flag of version.qaFlags) {
    if (flag.entityType === "story") flaggedStoryIds.add(flag.entityId);
    if (flag.entityType === "acceptance_criteria") {
      const storyId = storyIdByAcId.get(flag.entityId);
      if (storyId) flaggedStoryIds.add(storyId);
    }
  }
  const storyCount = version.stories.length || 1;
  const storiesWithoutFlags = version.stories.filter((story) => !flaggedStoryIds.has(story.id)).length;
  const qaPassRatePercentage = Math.round((storiesWithoutFlags / storyCount) * 100);
  const errorFlags = version.qaFlags.filter((flag) => flag.severity === "high").length;
  const warningFlags = version.qaFlags.length - errorFlags;

  // Step 6: duplicate story detection.
  const controls = await getCachedAIControls(version.pack.workspaceId);
  const storyEmbeddings = controls.aiEmbeddingEnabled
    ? await Promise.all(
        version.stories.map(async (story) => ({
          storyId: story.id,
          index: story.sortOrder,
          embedding: await embedText(
            `As a ${story.persona}, I want ${story.want} so that ${story.soThat}`,
            {
              workspaceId: version.pack.workspaceId,
              packId: version.pack.id,
              userId: "system",
              sourceIds,
              task: "duplicate_detection_embedding",
            }
          ),
        }))
      )
    : [];
  const duplicatePairs: Array<{ storyIndexA: number; storyIndexB: number; similarity: number }> = [];
  for (let i = 0; i < storyEmbeddings.length; i++) {
    for (let j = i + 1; j < storyEmbeddings.length; j++) {
      const similarity = cosineSimilarity(
        storyEmbeddings[i]!.embedding,
        storyEmbeddings[j]!.embedding
      );
      if (similarity > 0.92) {
        duplicatePairs.push({
          storyIndexA: storyEmbeddings[i]!.index,
          storyIndexB: storyEmbeddings[j]!.index,
          similarity: Number(similarity.toFixed(3)),
        });
      }
    }
  }

  const coherenceData = parsedCoherence ?? {};
  const coherenceOffTopic = coherenceData.offTopicStories ?? [];
  const coherenceScore = coherenceData.coherent
    ? 100
    : coherenceOffTopic.length === 0
      ? 100
      : coherenceOffTopic.length <= 1
        ? 50
        : 0;

  const selfReviewConfidence =
    typeof parsedSelfReview?.confidenceScore === "number"
      ? clamp(parsedSelfReview.confidenceScore, 0, 100)
      : null;

  const weightedInputs = [
    { key: "selfReview", score: selfReviewConfidence, weight: 35 },
    { key: "evidenceCoverage", score: evidenceCoveragePercentage, weight: 25 },
    { key: "qaPassRate", score: qaPassRatePercentage, weight: 20 },
    { key: "coherenceScore", score: coherenceScore, weight: 10 },
    { key: "assumptionPenalty", score: 100 - assumptionPercentage, weight: 10 },
  ].filter((entry) => typeof entry.score === "number") as Array<{
    key: string;
    score: number;
    weight: number;
  }>;

  const totalWeight = weightedInputs.reduce((sum, item) => sum + item.weight, 0) || 1;
  const confidenceScore = Math.round(
    weightedInputs.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
  );
  const confidenceLevel = getConfidenceLevel(confidenceScore);

  const flatReviewIssues: Array<ReviewIssue & { storyIndex: number }> = [];
  for (const storyReview of parsedSelfReview?.storyReviews ?? []) {
    for (const issue of storyReview.issues ?? []) {
      flatReviewIssues.push({ ...issue, storyIndex: storyReview.storyIndex });
    }
  }

  // Side effects: downgrade links and add QA flags for review issues.
  for (const issue of flatReviewIssues) {
    const story = version.stories[issue.storyIndex];
    if (!story) continue;
    const ac = story.acceptanceCriteria[issue.acIndex];
    if (!ac) continue;

    if (issue.issueType === "hallucination") {
      await db.evidenceLink.updateMany({
        where: {
          entityType: "acceptance_criteria",
          entityId: ac.id,
          confidence: "high",
        },
        data: { confidence: "medium" },
      });
      await db.evidenceLink.updateMany({
        where: {
          entityType: "acceptance_criteria",
          entityId: ac.id,
          confidence: "medium",
        },
        data: { confidence: "low" },
      });
    }

    await db.qAFlag.create({
      data: {
        packVersionId: version.id,
        entityType: "acceptance_criteria",
        entityId: ac.id,
        ruleCode: mapIssueToQaRule(issue.issueType),
        severity: issue.severity === "error" ? "high" : "medium",
        message: issue.description,
        suggestedFix: issue.suggestedFix,
      },
    });
  }

  const missedRequirements = parsedSelfReview?.missedRequirements ?? [];
  if (missedRequirements.length > 0) {
    const existingQuestions = (version.openQuestions as string[] | null) ?? [];
    const generatedQuestions = missedRequirements.map(
      (item) => `${item.topic}: ${item.suggestion} (evidence: ${item.sourceEvidence})`
    );
    const merged = Array.from(new Set([...existingQuestions, ...generatedQuestions]));
    await db.packVersion.update({
      where: { id: version.id },
      data: { openQuestions: merged },
    });
  }

  const report: QualityReport = {
    confidenceScore,
    confidenceLevel,
    selfReview: {
      overallAssessment: parsedSelfReview?.overallAssessment ?? "acceptable",
      issueCount: flatReviewIssues.length,
      issues: flatReviewIssues,
      missedRequirements,
    },
    evidenceCoverage: {
      percentage: evidenceCoveragePercentage,
      status: getCoverageStatus(evidenceCoveragePercentage),
      acsWithoutEvidence,
    },
    coherence: {
      isCoherent: parsedCoherence?.coherent ?? true,
      offTopicStories: coherenceOffTopic,
    },
    assumptions: {
      percentage: assumptionPercentage,
      status: getAssumptionStatus(assumptionPercentage),
      count: assumptionCount,
    },
    qaPassRate: {
      percentage: qaPassRatePercentage,
      totalFlags: version.qaFlags.length + flatReviewIssues.length,
      errorFlags: errorFlags + flatReviewIssues.filter((issue) => issue.severity === "error").length,
      warningFlags:
        warningFlags + flatReviewIssues.filter((issue) => issue.severity === "warning").length,
    },
    duplicates: {
      pairs: duplicatePairs,
    },
  };

  await db.packVersion.update({
    where: { id: version.id },
    data: {
      generationConfidence: report as unknown as Prisma.InputJsonValue,
      confidenceScore,
      confidenceLevel,
      selfReviewRun: !!selfReviewCall,
      selfReviewPassed:
        parsedSelfReview != null
          ? parsedSelfReview.storyReviews?.every(
              (storyReview) =>
                (storyReview.issues ?? []).filter((issue) => issue.severity === "error").length ===
                0
            ) ?? true
          : null,
    },
  });

  await inngest.send({
    name: "pack/quality.assessed",
    data: {
      packId: version.pack.id,
      packVersionId: version.id,
      confidenceScore,
      confidenceLevel,
    },
  });

  return report;
}
