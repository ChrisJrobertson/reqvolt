import { describe, it, expect } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  validateApiKeyFormat,
} from "../src/lib/api-keys";

describe("api-keys", () => {
  describe("generateApiKey", () => {
    it("produces correct format with rv_ prefix", () => {
      const { raw, hash, prefix } = generateApiKey();
      expect(raw).toMatch(/^rv_/);
      expect(raw.length).toBeGreaterThanOrEqual(20);
      expect(prefix).toMatch(/^rv_/);
      expect(prefix.length).toBe(10);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces unique keys", () => {
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe("hashApiKey", () => {
    it("produces consistent hash for same input", () => {
      const key = "rv_abc123xyz";
      expect(hashApiKey(key)).toBe(hashApiKey(key));
    });

    it("produces different hashes for different inputs", () => {
      expect(hashApiKey("rv_a")).not.toBe(hashApiKey("rv_b"));
    });

    it("produces 64-char hex string", () => {
      const hash = hashApiKey("rv_testkey");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("validateApiKeyFormat", () => {
    it("accepts valid keys with rv_ prefix and sufficient length", () => {
      expect(validateApiKeyFormat("rv_abcdefghijklmnopqrstuvwxyz")).toBe(true);
      expect(validateApiKeyFormat("rv_" + "a".repeat(20))).toBe(true);
    });

    it("rejects keys without rv_ prefix", () => {
      expect(validateApiKeyFormat("sk_abc123")).toBe(false);
      expect(validateApiKeyFormat("abc")).toBe(false);
    });

    it("rejects keys that are too short", () => {
      expect(validateApiKeyFormat("rv_short")).toBe(false);
      expect(validateApiKeyFormat("rv_")).toBe(false);
    });

    it("rejects non-strings", () => {
      expect(validateApiKeyFormat(null as unknown as string)).toBe(false);
      expect(validateApiKeyFormat(123 as unknown as string)).toBe(false);
    });
  });
});
