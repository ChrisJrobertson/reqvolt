/**
 * Shared Redis client for ioredis. Graceful fallback when REDIS_URL is unset or invalid.
 * Valid URLs: redis://... or rediss://... (TLS).
 * Invalid values (e.g. "/", empty) cause ENOTSOCK when ioredis treats them as socket paths.
 */
import Redis from "ioredis";
import { env } from "@/lib/env";

let _redis: Redis | null = null;

function isValidRedisUrl(url: string | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && (trimmed.startsWith("redis://") || trimmed.startsWith("rediss://"));
}

export function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.REDIS_URL;
  if (!isValidRedisUrl(url)) return null;
  try {
    _redis = new Redis(url);
    _redis.on("error", () => {
      // Silently ignore connection errors; callers handle null/fallback
    });
    return _redis;
  } catch {
    return null;
  }
}
