/**
 * Pack generation with readiness-grounded prompts and post-generation quality gate.
 */
import { db } from "../db";
import { buildGenerationUserPrompt } from "@/lib/prompts/generation-user";
import { GENERATION_SYSTEM_PROMPT } from "@/lib/prompts/generation-system";
import { getGenerationClient } from "@/lib/ai/model-router";
import { runQARules } from "./qa-rules";
import { assessGenerationQuality } from "./generation-quality-gate";
import {
  hashGenerationInputs,
  getCachedResponse,
  setCachedResponse,
} from "./generation-cache";
import {
  checkTokenBudget,
  addTokenUsage,
} from "./token-budget";

export interface GeneratePackInput {
  projectId: string;
  workspaceId: string;
  sourceIds: string[];
  templateId?: string;
  userNotes?: string;
  packId?: string; // When provided, add new version to existing pack (regenerate)
}

export async function generatePack(input: GeneratePackInput) {
  const { projectId, workspaceId, sourceIds, templateId, userNotes } = input;

  if (sourceIds.length === 0) {
    throw new Error("At least one source is required");
  }

  const sourcesWithChunks = await db.source.findMany({
    where: {
      workspaceId,
      projectId,
      id: { in: sourceIds },
      deletedAt: null,
      status: "completed",
    },
    select: {
      id: true,
      name: true,
      type: true,
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: {
          id: true,
          content: true,
          chunkIndex: true,
          metadata: true,
        },
      },
    },
  });

  const chunks = sourcesWithChunks.flatMap((source) =>
    source.chunks.map((chunk) => ({
      id: chunk.id,
      sourceId: source.id,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata as { speaker?: string | null; timestamp?: string | null } | null,
    }))
  );

  if (chunks.length === 0) {
    throw new Error(
      "No chunks found. Ensure sources have been processed (text extracted and embedded)."
    );
  }

  let templateContext: string | undefined;
  if (templateId) {
    const template = await db.template.findFirst({
      where: { id: templateId, workspaceId },
    });
    templateContext = template?.content as string | undefined;
  }

  let glossaryContext: string | undefined;
  const glossary = await db.glossaryEntry.findMany({
    where: { workspaceId },
  });
  if (glossary.length > 0) {
    glossaryContext = glossary
      .map((g) => `${g.term}: ${g.definition}`)
      .join("\n");
  }

  const generationClient = getGenerationClient();
  const model = generationClient.model;
  const cacheKey = hashGenerationInputs({
    sourceIds,
    templateId,
    userNotes,
    model,
  });

  const cached = await getCachedResponse(cacheKey);
  let parsed: PackGenerationResponse;

  if (cached) {
    parsed = cached as PackGenerationResponse;
  } else {
    const budgetCheck = await checkTokenBudget(workspaceId);
    if (!budgetCheck.ok) throw new Error(budgetCheck.error);

    const projectContext = [templateContext, glossaryContext, userNotes]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const prompt = buildGenerationUserPrompt(
      sourcesWithChunks.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.type,
        chunks: source.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata as
            | { speaker?: string | null; timestamp?: string | null }
            | null,
        })),
      })),
      projectContext || undefined
    );

    const response = await generationClient.call({
      workspaceId,
      packId: input.packId,
      userId: "system",
      task: "pack_generation",
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: 4096,
      sourceIds,
      sourceChunksSent: chunks.length,
    });

    if (response.skipped) {
      throw new Error(response.reason ?? "AI generation skipped for this workspace");
    }

    await addTokenUsage(workspaceId, response.inputTokens, response.outputTokens);
    const rawJson = response.text;

    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : rawJson;
    try {
      parsed = JSON.parse(jsonStr) as PackGenerationResponse;
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    await setCachedResponse(cacheKey, parsed);
  }

  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  if (!project) throw new Error("Project not found");

  let pack: { id: string };
  if (input.packId) {
    const existing = await db.pack.findFirst({
      where: { id: input.packId, workspaceId },
    });
    if (!existing) throw new Error("Pack not found");
    pack = existing;
  } else {
    pack = await db.pack.create({
      data: {
        projectId,
        workspaceId,
        name: `Story Pack - ${new Date().toLocaleDateString("en-GB")}`,
      },
    });
  }

  const latestVersion = await db.packVersion.findFirst({
    where: { packId: pack.id },
    orderBy: { versionNumber: "desc" },
  });
  const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  const packVersion = await db.packVersion.create({
    data: {
      packId: pack.id,
      versionNumber,
      sourceIds: sourceIds,
      summary: parsed.featureSummary ?? parsed.summary ?? "",
      nonGoals: Array.isArray(parsed.nonGoals)
        ? parsed.nonGoals.join("\n")
        : parsed.nonGoals ?? "",
      openQuestions: normaliseOpenQuestions(parsed.openQuestions),
      assumptions: normaliseAssumptions(parsed.assumptions),
      decisions: normaliseStringList(parsed.decisions),
      risks: normaliseStringList(parsed.risks),
      generationConfig: { model, userNotes },
    },
  });

  const chunkIdByIndex = new Map<number, string>();
  chunks.forEach((c, i) => chunkIdByIndex.set(i, c.id));
  const chunkIdSet = new Set(chunks.map((chunk) => chunk.id));

  for (let i = 0; i < (parsed.stories ?? []).length; i++) {
    const s = parsed.stories![i]!;
    const story = await db.story.create({
      data: {
        packVersionId: packVersion.id,
        sortOrder: i,
        persona: s.persona ?? "",
        want: s.want ?? "",
        soThat: s.benefit ?? s.soThat ?? "",
      },
    });

    const storyEvidenceChunkIds = (
      s.sourceReferences ??
      s.source_references ??
      s.evidenceChunkIndices?.map((idx) => chunkIdByIndex.get(idx)).filter(Boolean) ??
      []
    ).filter((id): id is string => chunkIdSet.has(id));
    for (const chunkId of storyEvidenceChunkIds) {
      await db.evidenceLink.create({
        data: {
          entityType: "story",
          entityId: story.id,
          sourceChunkId: chunkId,
          confidence: mapConfidenceLevel(s.confidence ?? "inferred"),
          evolutionStatus: "new",
        },
      });
    }

    for (let j = 0; j < (s.acceptanceCriteria ?? []).length; j++) {
      const ac = s.acceptanceCriteria![j]!;
      const acRecord = await db.acceptanceCriteria.create({
        data: {
          storyId: story.id,
          sortOrder: j,
          given: ac.given ?? "",
          when: ac.when ?? "",
          then: ac.then ?? "",
        },
      });

      const acEvidenceChunkIds = (
        ac.source_references ??
        ac.sourceReferences ??
        ac.evidenceChunkIndices?.map((idx) => chunkIdByIndex.get(idx)).filter(Boolean) ??
        []
      ).filter((id): id is string => chunkIdSet.has(id));

      for (const chunkId of acEvidenceChunkIds) {
        await db.evidenceLink.create({
          data: {
            entityType: "acceptance_criteria",
            entityId: acRecord.id,
            sourceChunkId: chunkId,
            confidence: mapConfidenceLevel(ac.confidence ?? "inferred"),
            evolutionStatus: "new",
          },
        });
      }
    }
  }

  await runQARules(packVersion.id);

  try {
    await assessGenerationQuality(pack.id, packVersion.id);
  } catch {
    await db.packVersion.update({
      where: { id: packVersion.id },
      data: {
        generationConfidence: {
          note: "Quality assessment unavailable for this generation. Manual review recommended.",
        },
        selfReviewRun: false,
        selfReviewPassed: null,
      },
    });
  }

  return { packId: pack.id, packVersionId: packVersion.id };
}

function mapConfidenceLevel(value: string): "high" | "medium" | "low" {
  const confidence = value.toLowerCase();
  if (confidence === "direct") return "high";
  if (confidence === "assumption") return "low";
  if (confidence === "high") return "high";
  if (confidence === "low") return "low";
  return "medium";
}

function normaliseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") return JSON.stringify(entry);
      return "";
    })
    .filter((entry) => entry.length > 0);
}

function normaliseOpenQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "question" in entry) {
        return String((entry as { question: string }).question);
      }
      return "";
    })
    .filter((entry) => entry.length > 0);
}

function normaliseAssumptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "statement" in entry) {
        return String((entry as { statement: string }).statement);
      }
      return "";
    })
    .filter((entry) => entry.length > 0);
}

interface PackGenerationResponse {
  featureSummary?: string;
  summary?: string;
  nonGoals?: string | string[];
  stories?: Array<{
    persona?: string;
    want?: string;
    soThat?: string;
    benefit?: string;
    confidence?: "direct" | "inferred" | "assumption" | "high" | "medium" | "low";
    sourceReferences?: string[];
    source_references?: string[];
    evidenceChunkIndices?: number[];
    acceptanceCriteria?: Array<{
      given?: string;
      when?: string;
      then?: string;
      confidence?: "direct" | "inferred" | "assumption" | "high" | "medium" | "low";
      sourceReferences?: string[];
      source_references?: string[];
      evidenceChunkIndices?: number[];
    }>;
  }>;
  openQuestions?: unknown[];
  assumptions?: unknown[];
  decisions?: unknown[];
  risks?: unknown[];
}
