/**
 * Model routing for cost optimisation.
 * Routes simple tasks (QA rewrite) to Haiku, complex tasks to Sonnet.
 */
import { env } from "@/lib/env";

export type LlmTaskType = "generation" | "qa-rewrite" | "refresh" | "impact-summary";

export function getModelForTask(taskType: LlmTaskType): string {
  switch (taskType) {
    case "qa-rewrite":
    case "impact-summary":
      return env.CLAUDE_MODEL_LIGHT;
    case "generation":
    case "refresh":
    default:
      return env.CLAUDE_MODEL;
  }
}
