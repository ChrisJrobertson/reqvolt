import { describe, it, expect } from "vitest";
import {
  buildStoryTitle,
  buildColumnValues,
  type FieldMapping,
} from "../src/server/integrations/monday";
import { getEvidenceSummaryForStory } from "../src/server/services/pack";

describe("Monday.com integration", () => {
  describe("buildStoryTitle", () => {
    it("uses full title when under 80 chars", () => {
      const title = buildStoryTitle(
        "product owner",
        "to prioritise the backlog",
        "I can deliver value"
      );
      expect(title).toBe(
        "As a product owner, I want to prioritise the backlog so that I can deliver value"
      );
    });

    it("truncates to 80 chars with ellipsis", () => {
      const long = "a".repeat(100);
      const title = buildStoryTitle(long, "x", "y");
      expect(title.length).toBe(80);
      expect(title.endsWith("...")).toBe(true);
    });
  });

  describe("buildColumnValues", () => {
    const values = {
      persona: "user",
      want: "to do X",
      soThat: "I get Y",
      evidence: "3 links (2 high)",
      storyId: "story-123",
    };

    it("returns empty object when mapping is empty", () => {
      const result = buildColumnValues({}, values);
      expect(result).toEqual({});
    });

    it("includes only mapped columns", () => {
      const mapping: FieldMapping = {
        personaColumnId: "persona_col",
        storyIdColumnId: "id_col",
      };
      const result = buildColumnValues(mapping, values);
      expect(result).toEqual({
        persona_col: "user",
        id_col: "story-123",
      });
    });

    it("includes all columns when fully mapped", () => {
      const mapping: FieldMapping = {
        personaColumnId: "p",
        wantColumnId: "w",
        soThatColumnId: "s",
        evidenceColumnId: "e",
        storyIdColumnId: "i",
      };
      const result = buildColumnValues(mapping, values);
      expect(result).toEqual({
        p: "user",
        w: "to do X",
        s: "I get Y",
        e: "3 links (2 high)",
        i: "story-123",
      });
    });

    it("skips empty values", () => {
      const mapping: FieldMapping = { personaColumnId: "p" };
      const result = buildColumnValues(mapping, {
        ...values,
        persona: "",
      });
      expect(result).toEqual({});
    });
  });
});

describe("getEvidenceSummaryForStory", () => {
  it("returns 'No evidence linked' when no evidence", () => {
    const result = getEvidenceSummaryForStory(
      { story: {}, acceptance_criteria: {} },
      "s1",
      []
    );
    expect(result).toBe("No evidence linked");
  });

  it("returns count and confidence breakdown", () => {
    const result = getEvidenceSummaryForStory(
      {
        story: {
          s1: [
            { confidence: "high" },
            { confidence: "medium" },
          ],
        },
        acceptance_criteria: {
          ac1: [{ confidence: "low" }],
        },
      },
      "s1",
      ["ac1"]
    );
    expect(result).toContain("3 evidence");
    expect(result).toContain("1 high");
    expect(result).toContain("1 medium");
    expect(result).toContain("1 low");
  });
});
