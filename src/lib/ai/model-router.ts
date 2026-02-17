import Anthropic from "@anthropic-ai/sdk";
import Redis from "ioredis";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { getLangfuse } from "@/server/lib/langfuse";

type AiTier = "generation" | "analysis";

export type AiTask =
  | "pack_generation"
  | "qa_autofix"
  | "self_review"
  | "topic_extraction"
  | "coherence_check"
  | "impact_summary"
  | "contradiction_detection";

interface AIControls {
  aiGenerationEnabled: boolean;
  aiQaAutoFixEnabled: boolean;
  aiSelfReviewEnabled: boolean;
  aiTopicExtractionEnabled: boolean;
  aiEmbeddingEnabled: boolean;
}

interface ModelCallInput {
  workspaceId: string;
  task: AiTask;
  tier: AiTier;
  userPrompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  userId?: string;
  packId?: string;
  sourceIds?: string[];
  sourceChunksSent?: number;
}

interface ModelCallResult {
  skipped: boolean;
  reason?: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

interface RoutedClient {
  model: string;
  tier: AiTier;
  call: (input: Omit<ModelCallInput, "tier">) => Promise<ModelCallResult>;
}

const RETRY_COUNT = 3;
const BASE_RETRY_DELAY_MS = 400;
const AI_CONTROLS_CACHE_TTL_SEC = 60 * 5;
const AI_API_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_PROVIDER = "anthropic";
const AI_ROUTED_VIA = "direct";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (!env.REDIS_URL) return null;
  _redis = new Redis(env.REDIS_URL);
  return _redis;
}

function getTaskDefaultMaxTokens(task: AiTask, tier: AiTier): number {
  if (task === "pack_generation") return 4096;
  if (task === "self_review") return 2048;
  if (task === "qa_autofix") return 1024;
  if (task === "topic_extraction") return 1200;
  if (task === "coherence_check") return 700;
  if (task === "contradiction_detection") return 900;
  if (task === "impact_summary") return 250;
  return tier === "generation" ? 2048 : 900;
}

function getTaskEnabled(
  task: AiTask,
  controls: AIControls
): { enabled: boolean; reason?: string } {
  if (task === "pack_generation" && !controls.aiGenerationEnabled) {
    return { enabled: false, reason: "AI generation disabled for this workspace" };
  }
  if (task === "qa_autofix" && !controls.aiQaAutoFixEnabled) {
    return { enabled: false, reason: "AI QA auto-fix disabled for this workspace" };
  }
  if ((task === "self_review" || task === "coherence_check") && !controls.aiSelfReviewEnabled) {
    return { enabled: false, reason: "AI self-review disabled for this workspace" };
  }
  if (
    (task === "topic_extraction" ||
      task === "impact_summary" ||
      task === "contradiction_detection") &&
    !controls.aiTopicExtractionEnabled
  ) {
    return { enabled: false, reason: "AI topic extraction and analysis disabled for this workspace" };
  }
  return { enabled: true };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTextFromResponse(response: Anthropic.Messages.Message): string {
  const textBlocks = response.content.filter((block) => block.type === "text");
  if (!textBlocks.length) return "";
  return textBlocks.map((block) => block.text).join("\n").trim();
}

function getModelForTier(tier: AiTier): string {
  if (tier === "analysis") return env.CLAUDE_HAIKU_MODEL || env.CLAUDE_MODEL_LIGHT;
  return env.CLAUDE_MODEL;
}

async function readAIControls(workspaceId: string): Promise<AIControls> {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      aiGenerationEnabled: true,
      aiQaAutoFixEnabled: true,
      aiSelfReviewEnabled: true,
      aiTopicExtractionEnabled: true,
      aiEmbeddingEnabled: true,
    },
  });

  if (!workspace) {
    return {
      aiGenerationEnabled: true,
      aiQaAutoFixEnabled: true,
      aiSelfReviewEnabled: true,
      aiTopicExtractionEnabled: true,
      aiEmbeddingEnabled: true,
    };
  }

  return workspace;
}

export async function getCachedAIControls(workspaceId: string): Promise<AIControls> {
  const redis = getRedis();
  const cacheKey = `ai-controls:${workspaceId}`;
  if (redis) {
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as AIControls;
      } catch {
        // Ignore malformed cache payload and refresh from DB.
      }
    }
  }

  const controls = await readAIControls(workspaceId);
  if (redis) {
    await redis.setex(cacheKey, AI_CONTROLS_CACHE_TTL_SEC, JSON.stringify(controls));
  }
  return controls;
}

export async function invalidateAIControlsCache(workspaceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`ai-controls:${workspaceId}`);
}

export async function trackModelUsage(
  model: string,
  task: string,
  inputTokens: number,
  outputTokens: number,
  options: { workspaceId: string; durationMs?: number; packId?: string }
): Promise<void> {
  await db.modelUsage.create({
    data: {
      workspaceId: options.workspaceId,
      model,
      task,
      inputTokens,
      outputTokens,
      durationMs: options.durationMs ?? 0,
      packId: options.packId,
    },
  });
}

async function logAIProcessingEvent(args: {
  workspaceId: string;
  userId?: string;
  task: AiTask;
  packId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  sourceIds?: string[];
  sourceChunksSent?: number;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.userId ?? "system",
      action: "ai_processing",
      entityType: args.task,
      entityId: args.packId,
      metadata: {
        model: args.model,
        provider: AI_PROVIDER,
        routedVia: AI_ROUTED_VIA,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        sourceChunksSent: args.sourceChunksSent ?? 0,
        sourceIds: args.sourceIds ?? [],
        dataRetentionByProvider: "none",
        processingRegion: "us",
        requestDurationMs: args.durationMs,
        apiEndpoint: AI_API_ENDPOINT,
      },
    },
  });
}

async function callWithRetries(input: ModelCallInput): Promise<ModelCallResult> {
  const controls = await getCachedAIControls(input.workspaceId);
  const controlCheck = getTaskEnabled(input.task, controls);
  const model = getModelForTier(input.tier);

  if (!controlCheck.enabled) {
    return {
      skipped: true,
      reason: controlCheck.reason,
      model,
      text: "",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    const start = Date.now();
    try {
      const langfuseTrace = getLangfuse()?.trace({
        name: `ai.${input.task}`,
        metadata: {
          model,
          workspaceId: input.workspaceId,
          packId: input.packId,
          task: input.task,
          attempt,
          sourceCount: input.sourceIds?.length ?? 0,
        },
      });

      const response = await anthropic.messages.create({
        model,
        max_tokens: input.maxTokens ?? getTaskDefaultMaxTokens(input.task, input.tier),
        ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
        messages: [
          {
            role: "user",
            content: input.userPrompt,
          },
        ],
      });

      const durationMs = Date.now() - start;
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      await trackModelUsage(model, input.task, inputTokens, outputTokens, {
        workspaceId: input.workspaceId,
        durationMs,
        packId: input.packId,
      });

      await logAIProcessingEvent({
        workspaceId: input.workspaceId,
        userId: input.userId,
        task: input.task,
        packId: input.packId,
        model,
        inputTokens,
        outputTokens,
        durationMs,
        sourceIds: input.sourceIds,
        sourceChunksSent: input.sourceChunksSent,
      });

      langfuseTrace?.update({
        metadata: {
          model,
          task: input.task,
          inputTokens,
          outputTokens,
          durationMs,
          sourceCount: input.sourceIds?.length ?? 0,
        },
      });

      return {
        skipped: false,
        model,
        text: extractTextFromResponse(response),
        inputTokens,
        outputTokens,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      const err = error instanceof Error ? error : new Error("Unknown model call error");
      lastError = err;

      getLangfuse()?.trace({
        name: `ai.${input.task}.error`,
        metadata: {
          model,
          task: input.task,
          workspaceId: input.workspaceId,
          attempt,
          durationMs,
          message: err.message,
        },
      });

      if (attempt < RETRY_COUNT) {
        await sleep(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError ?? new Error("Model call failed after retries");
}

export function getGenerationClient(): RoutedClient {
  return {
    model: getModelForTier("generation"),
    tier: "generation",
    call: (input) => callWithRetries({ ...input, tier: "generation" }),
  };
}

export function getAnalysisClient(): RoutedClient {
  return {
    model: getModelForTier("analysis"),
    tier: "analysis",
    call: (input) => callWithRetries({ ...input, tier: "analysis" }),
  };
}
