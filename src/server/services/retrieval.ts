/**
 * Top-K cosine similarity search over SourceChunk embeddings.
 */
import { db } from "../db";

export async function retrieveChunks(
  sourceIds: string[],
  queryEmbedding: number[],
  topK: number = 20
) {
  if (sourceIds.length === 0) return [];

  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const inParams = sourceIds.map((_, i) => `$${i + 2}`).join(", ");
  const limitParam = `$${sourceIds.length + 2}`;

  const chunks = await db.$queryRawUnsafe<
    Array<{
      id: string;
      content: string;
      sourceId: string;
      chunkIndex: number;
      similarity: number;
    }>
  >(
    `SELECT sc.id, sc.content, sc."sourceId", sc."chunkIndex",
            1 - (sc.embedding <=> $1::vector) as similarity
     FROM "SourceChunk" sc
     WHERE sc."sourceId" IN (${inParams})
       AND sc.embedding IS NOT NULL
     ORDER BY sc.embedding <=> $1::vector
     LIMIT ${limitParam}`,
    embeddingStr,
    ...sourceIds,
    topK
  );

  return chunks;
}
