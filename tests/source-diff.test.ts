import { describe, it, expect } from "vitest";
import {
  computeTextDiff,
  determineSeverity,
  type ChunkMapping,
} from "../src/lib/source-diff";

describe("source-diff", () => {
  describe("computeTextDiff", () => {
    it("detects insertions", () => {
      const regions = computeTextDiff("hello", "hello world");
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({ type: "added", text: " world" });
    });

    it("detects deletions", () => {
      const regions = computeTextDiff("hello world", "hello");
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({ type: "removed", text: " world" });
    });

    it("detects modifications", () => {
      const regions = computeTextDiff("hello foo", "hello bar");
      expect(regions.some((r) => r.type === "modified" || r.type === "removed")).toBe(true);
    });

    it("returns empty array for identical strings", () => {
      const regions = computeTextDiff("same", "same");
      expect(regions).toHaveLength(0);
    });

    it("handles empty source content without crash", () => {
      const regions = computeTextDiff("", "new");
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({ type: "added", text: "new" });
    });

    it("handles empty new content", () => {
      const regions = computeTextDiff("old", "");
      expect(regions).toHaveLength(1);
      expect(regions[0]).toMatchObject({ type: "removed", text: "old" });
    });
  });

  describe("determineSeverity", () => {
    it("returns major for >10 affected ACs", () => {
      const mappings: ChunkMapping[] = [{ oldChunkId: "a", diffType: "modified" }];
      expect(determineSeverity(11, mappings)).toBe("major");
    });

    it("returns moderate for removed chunks", () => {
      const mappings: ChunkMapping[] = [{ oldChunkId: "a", diffType: "removed" }];
      expect(determineSeverity(1, mappings)).toBe("moderate");
    });

    it("returns moderate for 3–10 affected ACs", () => {
      const mappings: ChunkMapping[] = [{ oldChunkId: "a", newChunkId: "b", diffType: "modified" }];
      expect(determineSeverity(5, mappings)).toBe("moderate");
    });

    it("returns minor for <3 ACs with high-similarity modified chunks", () => {
      const mappings: ChunkMapping[] = [
        { oldChunkId: "a", newChunkId: "b", diffType: "modified", similarityScore: 0.9 },
      ];
      expect(determineSeverity(1, mappings)).toBe("minor");
    });

    it("returns moderate when similarity is low", () => {
      const mappings: ChunkMapping[] = [
        { oldChunkId: "a", newChunkId: "b", diffType: "modified", similarityScore: 0.5 },
      ];
      expect(determineSeverity(1, mappings)).toBe("moderate");
    });
  });
});
