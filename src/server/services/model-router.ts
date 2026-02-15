/**
 * Model routing for cost optimisation.
 * Routes simple tasks (QA rewrite) to Haiku, complex tasks to Sonnet.
 */
export type LlmTaskType = "generation" | "qa-rewrite" | "refresh";

export function getModelForTask(taskType: LlmTaskType): string {
  switch (taskType) {
    case "qa-rewrite":
      return process.env.CLAUDE_MODEL_LIGHT ?? "claude-haiku-4-5-20251001";
    case "generation":
    case "refresh":
    default:
      return process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
  }
}
