/**
 * Source diff utilities for Phase 2: Source Change Detection.
 * Maps text diffs to chunk-level changes, with optional cosine similarity fallback.
 */
import diff from "fast-diff";
import type { PrismaClient } from "@prisma/client";

export interface DiffRegion {
  type: "added" | "removed" | "modified";
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface SourceChunkInfo {
  id: string;
  content: string;
  chunkIndex: number;
}

export interface ChunkMapping {
  oldChunkId: string;
  newChunkId?: string;
  diffType: "added" | "removed" | "modified";
  similarityScore?: number;
}

export type Severity = "minor" | "moderate" | "major";

/**
 * Compute text diff and return change regions with character offsets.
 * Uses fast-diff: -1 = DELETE, 0 = EQUAL, 1 = INSERT.
 */
export function computeTextDiff(
  oldText: string,
  newText: string
): DiffRegion[] {
  const result = diff(oldText, newText);
  const regions: DiffRegion[] = [];
  let oldOffset = 0;
  let newOffset = 0;

  for (const [op, text] of result) {
    const len = text.length;
    if (op === diff.DELETE) {
      regions.push({
        type: "removed",
        startOffset: oldOffset,
        endOffset: oldOffset + len,
        text,
      });
      oldOffset += len;
    } else if (op === diff.INSERT) {
      regions.push({
        type: "added",
        startOffset: newOffset,
        endOffset: newOffset + len,
        text,
      });
      newOffset += len;
    } else {
      // EQUAL - no region, just advance offsets
      oldOffset += len;
      newOffset += len;
    }
  }

  // Merge adjacent removed+added into modified for simplicity
  const merged: DiffRegion[] = [];
  for (let i = 0; i < regions.length; i++) {
    const curr = regions[i]!;
    const next = regions[i + 1];
    if (
      curr.type === "removed" &&
      next?.type === "added" &&
      next.startOffset === curr.endOffset
    ) {
      merged.push({
        type: "modified",
        startOffset: curr.startOffset,
        endOffset: next.endOffset,
        text: next.text,
      });
      i++;
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

function chunkOffsets(
  chunks: SourceChunkInfo[],
  fullText: string
): Array<{ start: number; end: number }> {
  const offsets: Array<{ start: number; end: number }> = [];
  let searchFrom = 0;
  for (const c of chunks) {
    const idx = fullText.indexOf(c.content, searchFrom);
    if (idx >= 0) {
      offsets.push({ start: idx, end: idx + c.content.length });
      searchFrom = idx + 1;
    } else {
      offsets.push({ start: searchFrom, end: searchFrom + c.content.length });
      searchFrom += c.content.length;
    }
  }
  return offsets;
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function textOverlapPercent(
  oldContent: string,
  newContent: string
): number {
  if (oldContent.length === 0 && newContent.length === 0) return 1;
  if (oldContent.length === 0 || newContent.length === 0) return 0;
  const minLen = Math.min(oldContent.length, newContent.length);
  let matches = 0;
  const shorter = oldContent.length <= newContent.length ? oldContent : newContent;
  const longer = oldContent.length > newContent.length ? oldContent : newContent;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i]!)) matches++;
  }
  return matches / minLen;
}

/**
 * Map diff regions to chunk-level mappings.
 * Uses text overlap first; falls back to cosine similarity when ambiguous.
 * oldText/newText are the full source texts used to compute chunk positions.
 */
export async function mapDiffToChunks(
  diffRegions: DiffRegion[],
  oldChunks: SourceChunkInfo[],
  newChunks: SourceChunkInfo[],
  oldText: string,
  newText: string,
  db: PrismaClient
): Promise<ChunkMapping[]> {
  const mappings: ChunkMapping[] = [];
  const oldOffsets = chunkOffsets(oldChunks, oldText);

  const affectedOldIndices = new Set<number>();
  for (const region of diffRegions) {
    if (region.type === "added") continue;
    for (let i = 0; i < oldChunks.length; i++) {
      const off = oldOffsets[i]!;
      if (overlap(region.startOffset, region.endOffset, off.start, off.end) > 0) {
        affectedOldIndices.add(i);
      }
    }
  }

  const matchedNewIndices = new Set<number>();

  for (const oldIdx of affectedOldIndices) {
    const oldChunk = oldChunks[oldIdx]!;
    let bestNewIdx: number | null = null;
    let bestScore = 0;
    let usedSimilarity = false;

    for (let j = 0; j < newChunks.length; j++) {
      const newChunk = newChunks[j]!;
      const overlapPct = textOverlapPercent(oldChunk.content, newChunk.content);
      if (overlapPct > bestScore) {
        bestScore = overlapPct;
        bestNewIdx = j;
        usedSimilarity = false;
      }
    }

    if (bestScore < 0.5 && oldChunk.content.length > 0) {
      const newChunkIds = newChunks.map((c) => c.id);
      const oldEmbedding = await db.$queryRawUnsafe<
        Array<{ embedding: string }>
      >(
        `SELECT embedding::text FROM "SourceChunk" WHERE id = $1 AND embedding IS NOT NULL LIMIT 1`,
        oldChunk.id
      );
      if (oldEmbedding.length === 0) continue;
      const embeddingStr = oldEmbedding[0]!.embedding;
      const inParams = newChunkIds.map((_, i) => `$${i + 2}`).join(", ");
      const simResult = await db.$queryRawUnsafe<
        Array<{ id: string; similarity: number }>
      >(
        `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
         FROM "SourceChunk"
         WHERE id IN (${inParams})
         ORDER BY similarity DESC
         LIMIT 1`,
        embeddingStr,
        ...newChunkIds
      );
      if (simResult.length > 0 && simResult[0]!.similarity > bestScore) {
        const newId = simResult[0]!.id;
        const j = newChunks.findIndex((c) => c.id === newId);
        if (j >= 0) {
          bestNewIdx = j;
          bestScore = simResult[0]!.similarity;
          usedSimilarity = true;
        }
      }
    }

    const sim = bestNewIdx !== null ? bestScore : 0;
    if (bestNewIdx !== null) {
      matchedNewIndices.add(bestNewIdx);
      const newChunk = newChunks[bestNewIdx]!;
      mappings.push({
        oldChunkId: oldChunk.id,
        newChunkId: newChunk.id,
        diffType: sim >= 0.95 ? "modified" : "modified",
        similarityScore: usedSimilarity ? sim : undefined,
      });
    } else {
      mappings.push({
        oldChunkId: oldChunk.id,
        diffType: "removed",
      });
    }
  }

  for (let j = 0; j < newChunks.length; j++) {
    if (!matchedNewIndices.has(j)) {
      mappings.push({
        oldChunkId: "", // No old chunk
        newChunkId: newChunks[j]!.id,
        diffType: "added",
      });
    }
  }

  return mappings;
}

/**
 * Determine severity from affected AC count and chunk mappings.
 */
export function determineSeverity(
  affectedAcCount: number,
  chunkMappings: ChunkMapping[],
  totalEvidenceChunks?: number
): Severity {
  const hasRemoved = chunkMappings.some((m) => m.diffType === "removed");
  const allModifiedHighSim = chunkMappings
    .filter((m) => m.diffType === "modified")
    .every((m) => (m.similarityScore ?? 1) > 0.85);

  if (affectedAcCount > 10) return "major";
  if (hasRemoved) return "moderate";
  if (affectedAcCount >= 3 && affectedAcCount <= 10) return "moderate";
  if (
    totalEvidenceChunks &&
    totalEvidenceChunks > 0 &&
    chunkMappings.length / totalEvidenceChunks > 0.3
  ) {
    return "major";
  }
  if (affectedAcCount < 3 && allModifiedHighSim) return "minor";
  return "moderate";
}
