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
  async ({ event, step }) => {
    const data = event.data as {
      sourceId: string;
      workspaceId: string;
      projectId?: string;
      replace?: boolean;
      newVersionId?: string;
      previousVersionId?: string;
    };
    const {
      sourceId,
      workspaceId,
      projectId,
      replace = false,
      newVersionId,
      previousVersionId,
    } = data;

    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });

    if (!source) throw new Error("Source not found");
    if (!source.content || source.content.length < 10) {
      return { sourceId, status: "skipped", reason: "insufficient_content" };
    }

    const existingChunks = await db.sourceChunk.findMany({
      where: { sourceId },
      select: { id: true },
      orderBy: { chunkIndex: "asc" },
    });

    if (existingChunks.length > 0 && !replace) {
      return { sourceId, status: "already_processed" };
    }

    const oldChunkIds = replace ? existingChunks.map((c) => c.id) : [];

    const chunkResults = await chunkText(source.content, {
      sourceType: source.type,
    });
    const newChunkIds: string[] = [];

    const metadataJson = (chunk: (typeof chunkResults)[number]) =>
      chunk.metadata
        ? JSON.stringify(chunk.metadata)
        : null;

    for (let i = 0; i < chunkResults.length; i++) {
      const chunk = chunkResults[i]!;
      const embedding = await embedText(chunk.content);
      const embeddingStr = `[${embedding.join(",")}]`;
      const id = randomUUID();
      newChunkIds.push(id);
      const meta = metadataJson(chunk);

      await db.$executeRawUnsafe(
        `INSERT INTO "SourceChunk" (id, "sourceId", content, "tokenCount", "chunkIndex", metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::vector)`,
        id,
        sourceId,
        chunk.content,
        chunk.tokenCount,
        chunk.chunkIndex,
        meta,
        embeddingStr
      );
    }

    const projId = projectId ?? source.projectId;

    if (replace && newVersionId && previousVersionId) {
      await step.sendEvent("trigger-detect-changes", {
        name: "source/version.created",
        data: {
          sourceId,
          newVersionId,
          previousVersionId,
          projectId: projId,
          workspaceId,
          oldChunkIds,
          newChunkIds,
        },
      });
    } else {
      await step.sendEvent("trigger-chunks-embedded", {
        name: "source/chunks.embedded",
        data: { sourceId, projectId: projId },
      });
    }

    return {
      sourceId,
      status: "completed",
      chunkCount: chunkResults.length,
      replace,
    };
  }
);
