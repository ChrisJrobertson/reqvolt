/**
 * API key generation and validation for workspace-scoped ingest API.
 */
import crypto from "crypto";

const PREFIX = "rv_";
const KEY_BYTES = 24;
const HASH_ALGORITHM = "sha256";

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(KEY_BYTES).toString("base64url");
  const fullKey = `${PREFIX}${raw}`;
  const hash = crypto.createHash(HASH_ALGORITHM).update(fullKey).digest("hex");
  const prefix = fullKey.slice(0, 10);
  return { raw: fullKey, hash, prefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(key).digest("hex");
}

export function validateApiKeyFormat(key: string): boolean {
  return typeof key === "string" && key.startsWith(PREFIX) && key.length >= 20;
}
