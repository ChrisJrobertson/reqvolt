/**
 * Methodology configuration types.
 */
export interface ArtefactTypeConfig {
  key: string;
  label: string;
  enabled: boolean;
}

export interface MethodologyConfigJson {
  artefactTypes: ArtefactTypeConfig[];
  terminology: {
    pack: string;
    baseline: string;
    sprint: string;
  };
  qaRuleOverrides: Record<string, { enabled: boolean }>;
  baselineLabelFormat: string;
  workflowStages: string[];
}
