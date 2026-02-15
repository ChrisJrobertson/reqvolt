/**
 * Generation cache - skip LLM call when inputs match and cache is fresh (< 24h).
 */
import crypto from "node:crypto";
import { db } from "../db";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function hashGenerationInputs(params: {
  sourceIds: string[];
  templateId?: string;
  userNotes?: string;
  model: string;
}): string {
  const sorted = [...params.sourceIds].sort();
  const payload = JSON.stringify({
    sourceIds: sorted,
    templateId: params.templateId ?? "",
    userNotes: params.userNotes ?? "",
    model: params.model,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function getCachedResponse(
  cacheKey: string
): Promise<unknown | null> {
  const cached = await db.generationCache.findUnique({
    where: { cacheKey },
  });
  if (!cached || cached.expiresAt < new Date()) return null;
  return cached.response as unknown;
}

export async function setCachedResponse(
  cacheKey: string,
  response: unknown
): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await db.generationCache.upsert({
    where: { cacheKey },
    create: { cacheKey, response: response as object, expiresAt },
    update: { response: response as object, expiresAt },
  });
}
