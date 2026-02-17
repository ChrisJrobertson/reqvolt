/**
 * OpenAI text-embedding-3-small for RAG.
 */
import OpenAI from "openai";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { trackModelUsage } from "@/lib/ai/model-router";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface EmbedTextOptions {
  workspaceId?: string;
  userId?: string;
  packId?: string;
  sourceIds?: string[];
  task?: string;
}

export async function embedText(text: string, options?: EmbedTextOptions): Promise<number[]> {
  const start = Date.now();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  if (options?.workspaceId) {
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const durationMs = Date.now() - start;
    const task = options.task ?? "embedding_generation";
    await trackModelUsage("text-embedding-3-small", task, inputTokens, 0, {
      workspaceId: options.workspaceId,
      durationMs,
      packId: options.packId,
    });
    await db.auditLog.create({
      data: {
        workspaceId: options.workspaceId,
        userId: options.userId ?? "system",
        action: "ai_processing",
        entityType: task,
        entityId: options.packId,
        metadata: {
          model: "text-embedding-3-small",
          provider: "openai",
          routedVia: "direct",
          inputTokens,
          outputTokens: 0,
          sourceChunksSent: options.sourceIds?.length ?? 0,
          sourceIds: options.sourceIds ?? [],
          dataRetentionByProvider: "none",
          processingRegion: "us",
          requestDurationMs: durationMs,
          apiEndpoint: "https://api.openai.com/v1/embeddings",
        },
      },
    });
  }

  return response.data[0]!.embedding;
}
