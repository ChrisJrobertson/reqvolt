import { inngest } from "../client";
import { db } from "@/server/db";
import { chunkText } from "@/lib/chunking";
import { embedText } from "@/server/services/embedding";
import { randomUUID } from "crypto";

export const chunkAndEmbed = inngest.createFunction(
  {
    id: "chunk-and-embed",
    retries: 2,
  },
  { event: "source/chunk-and-embed" },
  async ({ event }) => {
    const { sourceId, workspaceId } = event.data;

    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });

    if (!source) throw new Error("Source not found");
    if (!source.content || source.content.length < 10) {
      return { sourceId, status: "skipped", reason: "insufficient_content" };
    }

    const existingChunks = await db.sourceChunk.count({
      where: { sourceId },
    });
    if (existingChunks > 0) {
      return { sourceId, status: "already_processed" };
    }

    const chunks = await chunkText(source.content);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embedding = await embedText(chunk.content);
      const embeddingStr = `[${embedding.join(",")}]`;
      const id = randomUUID();

      await db.$executeRawUnsafe(
        `INSERT INTO "SourceChunk" (id, "sourceId", content, "tokenCount", "chunkIndex", embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        id,
        sourceId,
        chunk.content,
        chunk.tokenCount,
        chunk.chunkIndex,
        embeddingStr
      );
    }

    return {
      sourceId,
      status: "completed",
      chunkCount: chunks.length,
    };
  }
);
