/**
 * Iterative pack refresh: integrate new sources, produce change analysis.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { embedText } from "./embedding";
import { retrieveChunks } from "./retrieval";
import { buildRefreshPrompt } from "../prompts/refresh";
import { runQARules } from "./qa-rules";
import { getLangfuse } from "../lib/langfuse";
import { getModelForTask } from "./model-router";
import { checkTokenBudget, addTokenUsage } from "./token-budget";

const anthropic = new Anthropic();

export interface RefreshPackInput {
  packId: string;
  workspaceId: string;
  sourceIds: string[];
  userNotes?: string;
}

export async function refreshPack(input: RefreshPackInput) {
  const { packId, workspaceId, sourceIds, userNotes } = input;

  const pack = await db.pack.findFirst({
    where: { id: packId, workspaceId },
    include: { project: true },
  });
  if (!pack) throw new Error("Pack not found");

  const latestVersion = await db.packVersion.findFirst({
    where: { packId },
    orderBy: { versionNumber: "desc" },
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
    },
  });
  if (!latestVersion) throw new Error("No version to refresh");

  const previousSourceIds = (latestVersion.sourceIds as string[]) ?? [];
  const newSourceIds = sourceIds.filter((id) => !previousSourceIds.includes(id));

  if (newSourceIds.length === 0) {
    throw new Error("No new sources. Add sources to the project first.");
  }

  const queryEmbedding = await embedText(
    "Refresh story pack with new discovery evidence"
  );
  const chunks = await retrieveChunks(sourceIds, queryEmbedding, 30);

  if (chunks.length === 0) {
    throw new Error("No chunks found for selected sources.");
  }

  const allChunks = chunks.map((c) => ({
    content: c.content,
    sourceId: c.sourceId,
    isNew: newSourceIds.includes(c.sourceId),
  }));

  const previousPackJson = JSON.stringify({
    summary: latestVersion.summary,
    nonGoals: latestVersion.nonGoals,
    stories: latestVersion.stories.map((s) => ({
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
        given: ac.given,
        when: ac.when,
        then: ac.then,
      })),
    })),
    openQuestions: latestVersion.openQuestions,
    assumptions: latestVersion.assumptions,
    decisions: latestVersion.decisions,
    risks: latestVersion.risks,
  });

  const prompt = buildRefreshPrompt({
    previousPackJson,
    newSourceIds,
    allChunks,
    userNotes,
  });

  const model = getModelForTask("refresh");
  const budgetCheck = await checkTokenBudget(workspaceId);
  if (!budgetCheck.ok) throw new Error(budgetCheck.error);

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
    name: "pack.refresh",
    metadata: {
      model,
      workspaceId,
      packId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - start,
    },
  });

  const textContent = response.content.find((c) => c.type === "text");
  const rawJson =
    typeof textContent === "object" && "text" in textContent
      ? textContent.text
      : "";

  const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : rawJson;
  let parsed: RefreshPackResponse;
  try {
    parsed = JSON.parse(jsonStr) as RefreshPackResponse;
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  const versionNumber = latestVersion.versionNumber + 1;
  const chunkIdByIndex = new Map<number, string>();
  chunks.forEach((c, i) => chunkIdByIndex.set(i, c.id));

  const packVersion = await db.packVersion.create({
    data: {
      packId,
      versionNumber,
      sourceIds: sourceIds,
      summary: parsed.summary ?? "",
      nonGoals: parsed.nonGoals ?? "",
      openQuestions: parsed.openQuestions ?? [],
      assumptions: parsed.assumptions ?? [],
      decisions: parsed.decisions ?? [],
      risks: parsed.risks ?? [],
      generationConfig: { model, userNotes, isRefresh: true },
      changeAnalysis: parsed.changeAnalysis ?? {},
    },
  });

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

  return { packId, packVersionId: packVersion.id };
}

interface RefreshPackResponse {
  summary?: string;
  nonGoals?: string;
  stories?: Array<{
    persona?: string;
    want?: string;
    soThat?: string;
    evolutionStatus?: string;
    evidenceChunkIndices?: number[];
    acceptanceCriteria?: Array<{
      given?: string;
      when?: string;
      then?: string;
      evolutionStatus?: string;
      evidenceChunkIndices?: number[];
    }>;
  }>;
  openQuestions?: string[];
  assumptions?: string[];
  decisions?: string[];
  risks?: string[];
  changeAnalysis?: {
    storiesAdded?: string[];
    storiesModified?: string[];
    assumptionsResolved?: string[];
    newAssumptions?: string[];
    newOpenQuestions?: string[];
    evidenceEvolution?: string[];
  };
}
