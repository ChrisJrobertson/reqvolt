import Redis from "ioredis";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import type { ReadinessReport } from "./source-readiness";

const READINESS_TTL_SECONDS = 60 * 5;

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (!env.REDIS_URL) return null;
  _redis = new Redis(env.REDIS_URL);
  return _redis;
}

function hashSourceIds(sourceIds: string[]): string {
  const normalised = [...sourceIds].sort().join(",");
  return crypto.createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

export function buildReadinessCacheKey(projectId: string, sourceIds: string[]): string {
  return `readiness:${projectId}:${hashSourceIds(sourceIds)}`;
}

export async function getCachedReadiness(
  projectId: string,
  sourceIds: string[]
): Promise<ReadinessReport | null> {
  const redis = getRedis();
  if (!redis) return null;
  const key = buildReadinessCacheKey(projectId, sourceIds);
  const cached = await redis.get(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as ReadinessReport;
  } catch {
    return null;
  }
}

export async function setCachedReadiness(
  projectId: string,
  sourceIds: string[],
  report: ReadinessReport
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = buildReadinessCacheKey(projectId, sourceIds);
  await redis.setex(key, READINESS_TTL_SECONDS, JSON.stringify(report));
}

export async function invalidateReadinessCache(projectId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const stream = redis.scanStream({
    match: `readiness:${projectId}:*`,
    count: 100,
  });

  const pendingDeletes: Promise<unknown>[] = [];
  stream.on("data", (keys: string[]) => {
    if (!keys.length) return;
    pendingDeletes.push(redis.del(...keys));
  });

  await new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });

  await Promise.all(pendingDeletes);
}
