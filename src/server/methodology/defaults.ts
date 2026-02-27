/**
 * Built-in methodology presets.
 */
import type { MethodologyConfigJson } from "./types";

const DEFAULT_ARTEFACT_TYPES = [
  { key: "epic", label: "Epic", enabled: true },
  { key: "story", label: "User Story", enabled: true },
  { key: "nfr", label: "Non-Functional Requirement", enabled: true },
  { key: "assumption", label: "Assumption", enabled: true },
  { key: "risk", label: "Risk", enabled: true },
  { key: "decision", label: "Decision", enabled: true },
  { key: "product_description", label: "Product Description", enabled: false },
  { key: "stakeholder_map", label: "Stakeholder Map", enabled: false },
  { key: "influence_action", label: "Influence Action", enabled: false },
];

export const SCRUM_CONFIG: MethodologyConfigJson = {
  artefactTypes: DEFAULT_ARTEFACT_TYPES.map((a) => ({
    ...a,
    enabled: ["epic", "story", "nfr", "assumption", "risk", "decision"].includes(a.key),
  })),
  terminology: { pack: "Story Pack", baseline: "Baseline", sprint: "Sprint" },
  qaRuleOverrides: { VAGUE_TERM: { enabled: true }, UNTESTABLE: { enabled: true } },
  baselineLabelFormat: "Baseline v{N}",
  workflowStages: ["draft", "in_review", "approved", "baselined"],
};

export const KANBAN_CONFIG: MethodologyConfigJson = {
  artefactTypes: DEFAULT_ARTEFACT_TYPES.map((a) => ({
    ...a,
    enabled: ["epic", "story", "nfr", "assumption", "risk", "decision"].includes(a.key),
  })),
  terminology: { pack: "Story Pack", baseline: "Baseline", sprint: "Flow" },
  qaRuleOverrides: { VAGUE_TERM: { enabled: true }, UNTESTABLE: { enabled: true } },
  baselineLabelFormat: "Baseline v{N}",
  workflowStages: ["draft", "in_review", "approved", "baselined"],
};

export const PRINCE2_CONFIG: MethodologyConfigJson = {
  artefactTypes: DEFAULT_ARTEFACT_TYPES.map((a) => ({
    ...a,
    enabled:
      a.key === "product_description" ||
      ["epic", "nfr", "assumption", "risk", "decision"].includes(a.key),
  })),
  terminology: { pack: "Product Description Pack", baseline: "Stage Gate Baseline", sprint: "Stage" },
  qaRuleOverrides: { VAGUE_TERM: { enabled: true }, UNTESTABLE: { enabled: true } },
  baselineLabelFormat: "Stage Gate {N} Baseline",
  workflowStages: ["draft", "in_review", "approved", "baselined"],
};

export const ALIGN_CONFIG: MethodologyConfigJson = {
  artefactTypes: DEFAULT_ARTEFACT_TYPES.map((a) => ({
    ...a,
    enabled: ["epic", "story", "nfr", "assumption", "risk", "decision", "stakeholder_map", "influence_action"].includes(a.key),
  })),
  terminology: { pack: "Story Pack", baseline: "Baseline", sprint: "Sprint" },
  qaRuleOverrides: { VAGUE_TERM: { enabled: true }, UNTESTABLE: { enabled: true } },
  baselineLabelFormat: "Baseline v{N}",
  workflowStages: ["draft", "in_review", "approved", "baselined"],
};

export const CUSTOM_CONFIG: MethodologyConfigJson = {
  artefactTypes: DEFAULT_ARTEFACT_TYPES,
  terminology: { pack: "Story Pack", baseline: "Baseline", sprint: "Sprint" },
  qaRuleOverrides: { VAGUE_TERM: { enabled: true }, UNTESTABLE: { enabled: true } },
  baselineLabelFormat: "Baseline v{N}",
  workflowStages: ["draft", "in_review", "approved", "baselined"],
};

export const BUILT_IN_PRESETS = [
  { name: "Scrum", config: SCRUM_CONFIG },
  { name: "Kanban", config: KANBAN_CONFIG },
  { name: "PRINCE2", config: PRINCE2_CONFIG },
  { name: "ALIGN", config: ALIGN_CONFIG },
  { name: "Custom", config: CUSTOM_CONFIG },
];
