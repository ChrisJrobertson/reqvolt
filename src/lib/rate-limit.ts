/**
 * Rate limiting via Upstash Redis. Graceful no-op when not configured.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let _redis: Redis | null = null;
let _apiRateLimit: Ratelimit | null = null;
let _authRateLimit: Ratelimit | null = null;
let _webhookLimit: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export async function rateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) {
    return {
      success: true,
      remaining: params.limit,
      reset: Math.floor(Date.now() / 1000) + params.windowSeconds,
    };
  }
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(params.limit, `${params.windowSeconds} s`),
  });
  const result = await limiter.limit(params.key);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}

export async function apiRateLimit(identifier: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { success: true, remaining: 60, reset: Math.floor(Date.now() / 1000) + 3600 };

  if (!_apiRateLimit) {
    _apiRateLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 h"),
    });
  }
  const result = await _apiRateLimit.limit(identifier);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}

export async function authRateLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { success: true, remaining: 10, reset: Math.floor(Date.now() / 1000) + 60 };

  if (!_authRateLimit) {
    _authRateLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
    });
  }
  const result = await _authRateLimit.limit(ip);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}

export async function webhookLimit(ip: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { success: true, remaining: 100, reset: Math.floor(Date.now() / 1000) + 60 };

  if (!_webhookLimit) {
    _webhookLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
    });
  }
  const result = await _webhookLimit.limit(ip);
  return { success: result.success, remaining: result.remaining, reset: result.reset };
}
