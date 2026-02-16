/**
 * Token budget tracking per workspace per month.
 * Uses Redis when REDIS_URL is set; skips check otherwise.
 */
import Redis from "ioredis";
import { env } from "@/lib/env";

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.REDIS_URL;
  if (!url) return null;
  _redis = new Redis(url);
  return _redis;
}

export async function getCurrentTokenTotal(workspaceId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const now = new Date();
  const key = `token-budget:${workspaceId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

export async function checkTokenBudget(workspaceId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const redis = getRedis();
  if (!redis) return { ok: true };

  const total = await getCurrentTokenTotal(workspaceId);
  const budget = env.LLM_TOKEN_BUDGET_MONTHLY;

  if (total >= budget) {
    return {
      ok: false,
      error: `Monthly token budget exceeded (${total}/${budget}). Contact support to increase.`,
    };
  }
  return { ok: true };
}

export async function addTokenUsage(
  workspaceId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const now = new Date();
  const key = `token-budget:${workspaceId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await redis.incrby(key, inputTokens + outputTokens);
  await redis.expire(key, 60 * 60 * 24 * 35);
}
