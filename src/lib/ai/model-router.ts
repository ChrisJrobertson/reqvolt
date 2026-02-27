/**
 * Reqvolt uses multiple AI models optimised for cost and quality.
 * Tier 1 (Sonnet): Pack generation, QA auto-fix, self-review
 * Tier 2 (Haiku): Topic extraction, coherence check, impact summaries
 * Tier 3: Deterministic only (no AI)
 */
import { env } from "@/lib/env";
import { db } from "@/server/db";

export type LlmTaskType =
  | "pack_generation"
  | "qa_autofix"
  | "self_review"
  | "topic_extraction"
  | "coherence_check"
  | "impact_summary"
  | "evidence_classification";

export function getModelForTask(taskType: LlmTaskType): string {
  switch (taskType) {
    case "topic_extraction":
    case "coherence_check":
    case "impact_summary":
    case "evidence_classification":
      return env.CLAUDE_HAIKU_MODEL;
    case "pack_generation":
    case "qa_autofix":
    case "self_review":
    default:
      return env.CLAUDE_MODEL;
  }
}

export function isGenerationTierTask(taskType: LlmTaskType): boolean {
  return ["pack_generation", "qa_autofix", "self_review"].includes(taskType);
}

export function isAnalysisTierTask(taskType: LlmTaskType): boolean {
  return ["topic_extraction", "coherence_check", "impact_summary", "evidence_classification"].includes(taskType);
}

/**
 * Track model usage for cost monitoring. Writes to ModelUsage table.
 */
export async function trackModelUsage(params: {
  workspaceId: string;
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  packId?: string;
}): Promise<void> {
  try {
    await db.modelUsage.create({
      data: {
        workspaceId: params.workspaceId,
        model: params.model,
        task: params.task,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        durationMs: params.durationMs,
        packId: params.packId,
      },
    });
  } catch (err) {
    console.warn("[model-router] Failed to track usage:", err);
  }
}
