import { describe, it, expect } from "vitest";
import { buildJson } from "../src/server/services/json-export";

describe("json-export", () => {
  it("includes _meta object with required fields", () => {
    const buffer = buildJson({
      packId: "pack1",
      packVersionId: "pv1",
      packName: "P",
      projectName: "Proj",
      versionNumber: 1,
      sourceIds: ["s1"],
      sourceNames: ["Source 1"],
      healthScore: 85,
      healthStatus: "healthy",
      data: {
        summary: null,
        nonGoals: null,
        openQuestions: [],
        assumptions: [],
        decisions: [],
        risks: [],
        stories: [],
      },
    });
    const obj = JSON.parse(buffer.toString("utf-8"));
    expect(obj._meta).toBeDefined();
    expect(obj._meta.exportedAt).toBeDefined();
    expect(obj._meta.packVersion).toBe(1);
    expect(obj._meta.sourceIds).toEqual(["s1"]);
    expect(obj._meta.reqvoltVersion).toBe("1.0");
  });

  it("includes all stories with ACs, evidence links, QA flags", () => {
    const buffer = buildJson({
      packId: "pack1",
      packVersionId: "pv1",
      packName: "P",
      projectName: "Proj",
      versionNumber: 1,
      sourceIds: [],
      sourceNames: [],
      healthScore: null,
      healthStatus: null,
      data: {
        summary: "S",
        nonGoals: "NG",
        openQuestions: ["Q1"],
        assumptions: ["A1"],
        decisions: ["D1"],
        risks: ["R1"],
        stories: [
          {
            id: "story1",
            persona: "As a user",
            want: "I want X",
            soThat: "So that Y",
            acceptanceCriteria: [
              { id: "ac1", given: "G", when: "W", then: "T" },
            ],
            evidenceLinks: [{ sourceChunkId: "ch1", confidence: "high" }],
            qaFlags: [{ ruleCode: "VAGUE_TERM", severity: "medium", message: "M" }],
          },
        ],
      },
    });
    const obj = JSON.parse(buffer.toString("utf-8"));
    expect(obj.stories).toHaveLength(1);
    expect(obj.stories[0].id).toBe("story1");
    expect(obj.stories[0].persona).toBe("As a user");
    expect(obj.stories[0].acceptanceCriteria).toHaveLength(1);
    expect(obj.stories[0].evidenceLinks).toHaveLength(1);
    expect(obj.stories[0].qaFlags).toHaveLength(1);
    expect(obj.summary).toBe("S");
    expect(obj.assumptions).toContain("A1");
  });
});
