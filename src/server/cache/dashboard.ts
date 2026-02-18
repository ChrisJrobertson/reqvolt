/**
 * Dashboard stats cache. Redis 5-min TTL, graceful fallback when unset.
 */
import Redis from "ioredis";
import { env } from "@/lib/env";

const TTL_SEC = 5 * 60; // 5 minutes

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.REDIS_URL;
  if (!url) return null;
  _redis = new Redis(url);
  return _redis;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.setex(key, TTL_SEC, JSON.stringify(value));
}

export function dashboardCacheKey(workspaceId: string, suffix: string): string {
  return `dashboard:${workspaceId}:${suffix}`;
}
