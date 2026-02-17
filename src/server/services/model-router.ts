/**
 * Model routing for cost optimisation.
 * Routes simple tasks (QA rewrite) to Haiku, complex tasks to Sonnet.
 */
import { env } from "@/lib/env";
export {
  getAnalysisClient,
  getGenerationClient,
  trackModelUsage,
  getCachedAIControls,
  invalidateAIControlsCache,
} from "@/lib/ai/model-router";

export type LlmTaskType =
  | "generation"
  | "qa-rewrite"
  | "refresh"
  | "impact-summary"
  | "self-review"
  | "topic-extraction"
  | "coherence-check";

export function getModelForTask(taskType: LlmTaskType): string {
  switch (taskType) {
    case "qa-rewrite":
    case "impact-summary":
    case "topic-extraction":
    case "coherence-check":
      return env.CLAUDE_HAIKU_MODEL || env.CLAUDE_MODEL_LIGHT;
    case "self-review":
    case "generation":
    case "refresh":
    default:
      return env.CLAUDE_MODEL;
  }
}
