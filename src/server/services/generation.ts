/**
 * Pack generation: RAG retrieval, prompt assembly, Anthropic call, DB persistence.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { embedText } from "./embedding";
import { retrieveChunks } from "./retrieval";
import { buildGenerationPrompt } from "../prompts/generation";
import { runQARules } from "./qa-rules";
import { getLangfuse } from "../lib/langfuse";
import { getModelForTask } from "./model-router";
import {
  hashGenerationInputs,
  getCachedResponse,
  setCachedResponse,
} from "./generation-cache";
import {
  checkTokenBudget,
  addTokenUsage,
} from "./token-budget";

const anthropic = new Anthropic();

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

  const queryEmbedding = await embedText(
    "Generate user stories with acceptance criteria from discovery inputs"
  );
  const chunks = await retrieveChunks(sourceIds, queryEmbedding, 20);

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

  const model = getModelForTask("generation");
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
    getLangfuse()?.trace({
      name: "pack.generation",
      metadata: { model, workspaceId, cacheHit: true },
    });
  } else {
    const budgetCheck = await checkTokenBudget(workspaceId);
    if (!budgetCheck.ok) throw new Error(budgetCheck.error);

    const prompt = buildGenerationPrompt({
      sourceChunks: chunks.map((c) => ({ content: c.content, sourceId: c.sourceId })),
      templateContext,
      glossaryContext,
      userNotes,
    });

    const start = Date.now();
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    await addTokenUsage(workspaceId, inputTokens, outputTokens);

    getLangfuse()?.trace({
      name: "pack.generation",
      metadata: {
        model,
        workspaceId,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        cacheHit: false,
      },
    });

    const textContent = response.content.find((c) => c.type === "text");
    const rawJson =
      typeof textContent === "object" && "text" in textContent
        ? textContent.text
        : "";

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
      summary: parsed.summary ?? "",
      nonGoals: parsed.nonGoals ?? "",
      openQuestions: parsed.openQuestions ?? [],
      assumptions: parsed.assumptions ?? [],
      decisions: parsed.decisions ?? [],
      risks: parsed.risks ?? [],
      generationConfig: { model, userNotes },
    },
  });

  const chunkIdByIndex = new Map<number, string>();
  chunks.forEach((c, i) => chunkIdByIndex.set(i, c.id));

  for (let i = 0; i < (parsed.stories ?? []).length; i++) {
    const s = parsed.stories![i]!;
    const story = await db.story.create({
      data: {
        packVersionId: packVersion.id,
        sortOrder: i,
        persona: s.persona ?? "",
        want: s.want ?? "",
        soThat: s.soThat ?? "",
      },
    });

    const storyEvidenceIndices = s.evidenceChunkIndices ?? [];
    for (const idx of storyEvidenceIndices) {
      const chunkId = chunkIdByIndex.get(idx);
      if (chunkId) {
        await db.evidenceLink.create({
          data: {
            entityType: "story",
            entityId: story.id,
            sourceChunkId: chunkId,
            confidence: "medium",
            evolutionStatus: "new",
          },
        });
      }
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

      const acEvidenceIndices = ac.evidenceChunkIndices ?? [];
      for (const idx of acEvidenceIndices) {
        const chunkId = chunkIdByIndex.get(idx);
        if (chunkId) {
          await db.evidenceLink.create({
            data: {
              entityType: "acceptance_criteria",
              entityId: acRecord.id,
              sourceChunkId: chunkId,
              confidence: "medium",
              evolutionStatus: "new",
            },
          });
        }
      }
    }
  }

  await runQARules(packVersion.id);

  return { packId: pack.id, packVersionId: packVersion.id };
}

interface PackGenerationResponse {
  summary?: string;
  nonGoals?: string;
  stories?: Array<{
    persona?: string;
    want?: string;
    soThat?: string;
    evidenceChunkIndices?: number[];
    acceptanceCriteria?: Array<{
      given?: string;
      when?: string;
      then?: string;
      evidenceChunkIndices?: number[];
    }>;
  }>;
  openQuestions?: string[];
  assumptions?: string[];
  decisions?: string[];
  risks?: string[];
}
