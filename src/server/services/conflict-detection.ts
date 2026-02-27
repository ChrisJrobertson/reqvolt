/**
 * Conflict detection between source evidence chunks.
 * Finds semantically similar chunks from different sources and uses AI to detect contradictions.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { getModelForTask } from "@/lib/ai/model-router";
const anthropic = new Anthropic();
const BATCH_SIZE = 10;

export interface ConflictPair {
  chunkAId: string;
  chunkBId: string;
  contentA: string;
  contentB: string;
  sourceAName: string;
  sourceBName: string;
  similarity: number;
}

export async function detectConflicts(
  projectId: string,
  workspaceId: string
): Promise<Array<{ id: string; chunkAId: string; chunkBId: string }>> {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    include: {
      sources: {
        where: { deletedAt: null },
        select: { id: true, name: true },
      },
    },
  });
  if (!project) throw new Error("Project not found");

  const sourceIds = project.sources.map((s) => s.id);
  if (sourceIds.length < 2) return [];

  const existingConflicts = await db.evidenceConflict.findMany({
    where: { projectId },
    select: { chunkAId: true, chunkBId: true },
  });
  const existingSet = new Set(
    existingConflicts.flatMap((c) => [
      `${c.chunkAId}:${c.chunkBId}`,
      `${c.chunkBId}:${c.chunkAId}`,
    ])
  );

  const pairs = await findSimilarPairsFromDifferentSources(projectId, sourceIds);
  const toProcess = pairs.filter(
    (p) =>
      !existingSet.has(`${p.chunkAId}:${p.chunkBId}`) &&
      !existingSet.has(`${p.chunkBId}:${p.chunkAId}`)
  );

  const created: Array<{ id: string; chunkAId: string; chunkBId: string }> = [];

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const results = await checkContradictionsBatch(batch);

    for (const r of results) {
      if (r.contradicts && r.confidence >= 0.5) {
        const conflict = await db.evidenceConflict.create({
          data: {
            workspaceId,
            projectId,
            chunkAId: r.chunkAId,
            chunkBId: r.chunkBId,
            conflictSummary: r.summary,
            confidence: r.confidence,
          },
        });
        created.push({
          id: conflict.id,
          chunkAId: conflict.chunkAId,
          chunkBId: conflict.chunkBId,
        });
        existingSet.add(`${r.chunkAId}:${r.chunkBId}`);
      }
    }
  }

  return created;
}

async function findSimilarPairsFromDifferentSources(
  projectId: string,
  _sourceIds: string[]
): Promise<ConflictPair[]> {
  if (_sourceIds.length < 2) return [];

  const rows = await db.$queryRawUnsafe<
    Array<{
      id_a: string;
      id_b: string;
      content_a: string;
      content_b: string;
      source_a_name: string;
      source_b_name: string;
      similarity: number;
    }>
  >(
    `SELECT sca.id as id_a, scb.id as id_b,
            sca.content as content_a, scb.content as content_b,
            sa.name as source_a_name, sb.name as source_b_name,
            1 - (sca.embedding <=> scb.embedding) as similarity
     FROM "SourceChunk" sca
     JOIN "Source" sa ON sca."sourceId" = sa.id AND sa."projectId" = $1
     JOIN "SourceChunk" scb ON scb.id > sca.id
     JOIN "Source" sb ON scb."sourceId" = sb.id AND sb."projectId" = $1 AND sb.id != sa.id
     WHERE sca.embedding IS NOT NULL AND scb.embedding IS NOT NULL
       AND (1 - (sca.embedding <=> scb.embedding)) > 0.85`,
    projectId
  );

  return rows.map((r) => ({
    chunkAId: r.id_a,
    chunkBId: r.id_b,
    contentA: r.content_a,
    contentB: r.content_b,
    sourceAName: r.source_a_name,
    sourceBName: r.source_b_name,
    similarity: r.similarity,
  }));
}

async function checkContradictionsBatch(
  pairs: ConflictPair[]
): Promise<
  Array<{
    chunkAId: string;
    chunkBId: string;
    contradicts: boolean;
    summary: string;
    confidence: number;
  }>
> {
  const prompt = pairs
    .map(
      (p, i) =>
        `[${i}] Source A (${p.sourceAName}): "${p.contentA.slice(0, 400)}" | Source B (${p.sourceBName}): "${p.contentB.slice(0, 400)}"`
    )
    .join("\n\n");

  try {
    const model = getModelForTask("evidence_classification");
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: `You are analysing source evidence for contradictions. For each pair, determine if they contradict each other. Return JSON array: [{"index":0,"contradicts":true,"summary":"brief explanation","confidence":0.9}].`,
      messages: [
        {
          role: "user",
          content: `Analyse these pairs. Return ONLY a JSON array.\n\n${prompt}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const rawText =
      typeof textContent === "object" && "text" in textContent ? textContent.text : "";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      contradicts: boolean;
      summary: string;
      confidence: number;
    }>;

    return parsed
      .filter((p) => p.index >= 0 && p.index < pairs.length)
      .map((p) => {
        const pair = pairs[p.index]!;
        return {
          chunkAId: pair.chunkAId,
          chunkBId: pair.chunkBId,
          contradicts: Boolean(p.contradicts),
          summary: String(p.summary ?? ""),
          confidence: Math.min(1, Math.max(0, Number(p.confidence) ?? 0.5)),
        };
      });
  } catch {
    return [];
  }
}
