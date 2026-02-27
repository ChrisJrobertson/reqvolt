/**
 * AI-powered classification of source evidence chunks.
 * Tags: REQUIREMENT, DECISION, COMMITMENT, QUESTION, CONTEXT, CONSTRAINT.
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { getModelForTask, trackModelUsage } from "@/lib/ai/model-router";
import type { ClassificationTag } from "@prisma/client";

const anthropic = new Anthropic();

const TAGS = [
  "REQUIREMENT",
  "DECISION",
  "COMMITMENT",
  "QUESTION",
  "CONTEXT",
  "CONSTRAINT",
] as const;

export interface ClassificationResult {
  chunkId: string;
  tag: (typeof TAGS)[number];
  confidence: number;
}

export async function classifyChunks(
  chunks: { id: string; content: string }[],
  workspaceId: string
): Promise<ClassificationResult[]> {
  if (chunks.length === 0) return [];

  const BATCH_SIZE = 20;
  const results: ClassificationResult[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchResults = await classifyBatch(batch, workspaceId);
    results.push(...batchResults);
  }

  for (const r of results) {
    const tag = r.tag as ClassificationTag;
    if (TAGS.includes(r.tag)) {
      await db.sourceChunk.update({
        where: { id: r.chunkId },
        data: {
          classificationTag: tag,
          classificationConfidence: r.confidence,
        },
      });
    }
  }

  return results;
}

async function classifyBatch(
  chunks: { id: string; content: string }[],
  workspaceId: string
): Promise<ClassificationResult[]> {
  const prompt = chunks
    .map(
      (c, i) =>
        `[${i}] id=${c.id}\n${c.content.slice(0, 800)}${c.content.length > 800 ? "..." : ""}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are classifying source evidence chunks for requirements engineering. For each chunk, assign exactly one tag: REQUIREMENT (a stated need or capability), DECISION (a choice that has been made), COMMITMENT (a promise or agreement), QUESTION (an unresolved query), CONTEXT (background information), CONSTRAINT (a limitation or boundary). Return JSON array with { chunkId, tag, confidence } where confidence is 0.0 to 1.0.`;

  try {
    const start = Date.now();
    const model = getModelForTask("evidence_classification");
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Classify each chunk. Return ONLY a JSON array, no other text. Example: [{"chunkId":"abc","tag":"REQUIREMENT","confidence":0.9}]\n\n${prompt}`,
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    const rawText =
      typeof textContent === "object" && "text" in textContent ? textContent.text : "";
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      chunkId: string;
      tag: string;
      confidence: number;
    }>;

    const idToChunk = new Map(chunks.map((c) => [c.id, c]));
    const valid: ClassificationResult[] = [];
    for (const p of parsed) {
      if (idToChunk.has(p.chunkId) && TAGS.includes(p.tag as (typeof TAGS)[number])) {
        valid.push({
          chunkId: p.chunkId,
          tag: p.tag as (typeof TAGS)[number],
          confidence: Math.min(1, Math.max(0, Number(p.confidence) ?? 0.5)),
        });
      }
    }

    await trackModelUsage({
      workspaceId,
      model,
      task: "evidence_classification",
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - start,
    });

    return valid;
  } catch {
    return [];
  }
}
