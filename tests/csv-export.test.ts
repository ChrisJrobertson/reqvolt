import { describe, it, expect } from "vitest";
import { buildCsv } from "../src/server/services/csv-export";

describe("csv-export", () => {
  it("produces UTF-8 BOM for Excel compatibility", () => {
    const buffer = buildCsv({
      packName: "Test Pack",
      projectName: "Test Project",
      versionNumber: 1,
      sourceNames: ["Source 1"],
      generationDate: "1 January 2026",
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
    // UTF-8 BOM is EF BB BF
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });

  it("includes metadata header rows", () => {
    const buffer = buildCsv({
      packName: "My Pack",
      projectName: "My Project",
      clientName: "Acme Ltd",
      versionNumber: 2,
      sourceNames: ["Notes.docx", "Email"],
      generationDate: "26 February 2026",
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
    const str = buffer.toString("utf-8");
    expect(str).toContain("Pack");
    expect(str).toContain("My Pack");
    expect(str).toContain("Project");
    expect(str).toContain("My Project");
    expect(str).toContain("Client");
    expect(str).toContain("Acme Ltd");
    expect(str).toContain("Generation Date");
    expect(str).toContain("26 February 2026");
    expect(str).toContain("Notes.docx");
  });

  it("includes column headers", () => {
    const buffer = buildCsv({
      packName: "P",
      projectName: "P",
      versionNumber: 1,
      sourceNames: [],
      generationDate: "1 Jan 2026",
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
    const str = buffer.toString("utf-8");
    expect(str).toContain("artefact_type");
    expect(str).toContain("id");
    expect(str).toContain("title");
    expect(str).toContain("description");
    expect(str).toContain("acceptance_criteria");
    expect(str).toContain("evidence_sources");
  });

  it("outputs stories with pipe-separated ACs", () => {
    const buffer = buildCsv({
      packName: "P",
      projectName: "P",
      versionNumber: 1,
      sourceNames: [],
      generationDate: "1 Jan 2026",
      data: {
        summary: null,
        nonGoals: null,
        openQuestions: [],
        assumptions: [],
        decisions: [],
        risks: [],
        stories: [
          {
            id: "s1",
            persona: "As a user",
            want: "I want to login",
            soThat: "I can access my account",
            acceptanceCriteria: [
              { given: "valid credentials", when: "I submit", then: "I am logged in" },
            ],
            evidenceSources: ["Meeting notes"],
          },
        ],
      },
    });
    const str = buffer.toString("utf-8");
    expect(str).toContain("story");
    expect(str).toContain("s1");
    expect(str).toContain("As a user");
    expect(str).toContain("valid credentials | I submit | I am logged in");
    expect(str).toContain("Meeting notes");
  });
});
