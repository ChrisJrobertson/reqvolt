/**
 * Model routing for cost optimisation.
 * Re-exports from lib/ai with backward compatibility for legacy task names.
 */
import {
  getModelForTask as getModelForTaskNew,
  trackModelUsage as trackModelUsageNew,
  type LlmTaskType as LlmTaskTypeNew,
} from "@/lib/ai/model-router";

export type LlmTaskType =
  | "generation"
  | "qa-rewrite"
  | "refresh"
  | "impact-summary"
  | LlmTaskTypeNew;

const LEGACY_TO_NEW: Record<string, LlmTaskTypeNew> = {
  generation: "pack_generation",
  "qa-rewrite": "qa_autofix",
  refresh: "pack_generation",
  "impact-summary": "impact_summary",
};

export function getModelForTask(taskType: LlmTaskType): string {
  const mapped = LEGACY_TO_NEW[taskType as string] ?? (taskType as LlmTaskTypeNew);
  return getModelForTaskNew(mapped);
}

export { trackModelUsageNew as trackModelUsage };
