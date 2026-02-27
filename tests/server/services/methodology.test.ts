import { describe, it, expect } from "vitest";
import { buildGenerationPrompt } from "@/server/prompts/generation";
import type { MethodologyConfigJson } from "@/server/methodology/types";

describe("methodology in generation prompt", () => {
  const baseChunks = [{ content: "Test chunk", sourceId: "s1" }];

  it("includes default terminology when no methodology", () => {
    const prompt = buildGenerationPrompt({
      sourceChunks: baseChunks,
    });
    expect(prompt).toContain("Story Pack");
    expect(prompt).toContain("user stories");
  });

  it("includes methodology terminology when provided", () => {
    const methodology: MethodologyConfigJson = {
      artefactTypes: [],
      terminology: { pack: "Product Description Pack", baseline: "Stage Gate", sprint: "Stage" },
      qaRuleOverrides: {},
      baselineLabelFormat: "Stage Gate {N}",
      workflowStages: [],
    };
    const prompt = buildGenerationPrompt({
      sourceChunks: baseChunks,
      methodology,
    });
    expect(prompt).toContain("Product Description Pack");
    expect(prompt).toContain("pack=\"Product Description Pack\"");
    expect(prompt).toContain("baseline=\"Stage Gate\"");
  });

  it("requests Product Descriptions when PRINCE2 artefact types", () => {
    const methodology: MethodologyConfigJson = {
      artefactTypes: [
        { key: "product_description", label: "Product Description", enabled: true },
        { key: "story", label: "User Story", enabled: false },
      ],
      terminology: { pack: "Product Description Pack", baseline: "Stage Gate", sprint: "Stage" },
      qaRuleOverrides: {},
      baselineLabelFormat: "Stage Gate {N}",
      workflowStages: [],
    };
    const prompt = buildGenerationPrompt({
      sourceChunks: baseChunks,
      methodology,
    });
    expect(prompt).toContain("Product Descriptions");
    expect(prompt).toContain("stakeholder/capability/benefit");
  });

  it("requests Stakeholder Maps when ALIGN artefact types", () => {
    const methodology: MethodologyConfigJson = {
      artefactTypes: [
        { key: "stakeholder_map", label: "Stakeholder Map", enabled: true },
        { key: "story", label: "User Story", enabled: true },
      ],
      terminology: { pack: "Story Pack", baseline: "Baseline", sprint: "Sprint" },
      qaRuleOverrides: {},
      baselineLabelFormat: "Baseline v{N}",
      workflowStages: [],
    };
    const prompt = buildGenerationPrompt({
      sourceChunks: baseChunks,
      methodology,
    });
    expect(prompt).toContain("Stakeholder Maps");
    expect(prompt).toContain("Influence Actions");
  });
});
