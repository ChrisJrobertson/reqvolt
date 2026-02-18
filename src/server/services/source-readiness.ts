/**
 * Pre-generation source readiness assessment.
 * Validates that source material is sufficient before generation starts.
 */
import { db } from "../db";
import Anthropic from "@anthropic-ai/sdk";
import { getModelForTask, trackModelUsage } from "@/lib/ai/model-router";

const anthropic = new Anthropic();

const SOURCE_TYPE_SUITABILITY: Record<string, number> = {
  PDF: 1.0,
  DOCX: 1.0,
  MEETING_NOTES: 0.9,
  CUSTOMER_FEEDBACK: 0.8,
  WORKSHOP_NOTES: 0.9,
  RETRO_NOTES: 0.8,
  INTERVIEW_TRANSCRIPT: 0.7,
  TRANSCRIPT: 0.7,
  EMAIL: 0.7,
  OTHER: 0.5,
};

export interface TopicCoverage {
  topic: string;
  depth: "detailed" | "moderate" | "mentioned" | "minimal";
  chunkCount: number;
}

export interface ReadinessCheck {
  name: string;
  status: "pass" | "warning" | "blocked";
  message: string | null;
  details?: unknown;
}

export interface ReadinessReport {
  overallStatus: "ready" | "warnings" | "blocked";
  checks: ReadinessCheck[];
  topics: TopicCoverage[];
  estimatedStoryCount: number;
  estimatedGenerationTime: string;
}

interface SourceWithChunks {
  id: string;
  name: string;
  type: string;
  chunks: Array<{
    id: string;
    content: string;
    tokenCount: number;
  }>;
}

export async function assessSourceReadiness(
  projectId: string,
  sourceIds: string[],
  workspaceId: string,
  options?: { skipTopicExtraction?: boolean }
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  let topics: TopicCoverage[] = [];

  const project = await db.project.findFirst({
    where: { id: projectId },
    include: { workspace: true },
  });
  if (!project) throw new Error("Project not found");

  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId },
  });
  if (!workspace) throw new Error("Workspace not found");

  const sources = await db.source.findMany({
    where: { id: { in: sourceIds }, projectId, workspaceId, deletedAt: null },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
        select: { id: true, content: true, tokenCount: true },
      },
    },
  });

  const sourcesWithEmbeddings = await Promise.all(
    sources.map(async (s) => {
      const chunks = await db.sourceChunk.findMany({
        where: { sourceId: s.id },
        select: { id: true, content: true, tokenCount: true },
        orderBy: { chunkIndex: "asc" },
      });
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        chunks,
      } satisfies SourceWithChunks;
    })
  );

  const totalTokens = sourcesWithEmbeddings.reduce(
    (sum, s) => sum + s.chunks.reduce((c, ch) => c + (ch.tokenCount || Math.ceil(ch.content.length / 4)), 0),
    0
  );
  const totalChunks = sourcesWithEmbeddings.reduce((sum, s) => sum + s.chunks.length, 0);

  // CHECK 1: Volume Threshold
  const volumeStatus =
    totalTokens < 500 ? "blocked" : totalTokens < 2000 ? "warning" : "pass";
  const wordEstimate = Math.round(totalTokens * 0.75);
  checks.push({
    name: "Volume",
    status: volumeStatus,
    message:
      totalTokens < 500
        ? `Your sources contain very little content (${wordEstimate} words). Add more detail to get useful story generation.`
        : totalTokens < 2000
          ? `Limited source material (${wordEstimate} words). Generated stories may rely on inference for some acceptance criteria.`
          : null,
    details: { totalTokens, wordEstimate },
  });

  // CHECK 2: Topic Coverage (Haiku) - skip if disabled
  const topicExtractionEnabled = workspace.aiTopicExtractionEnabled && !options?.skipTopicExtraction;
  if (topicExtractionEnabled && totalChunks > 0) {
    const contentForTopics = sourcesWithEmbeddings
      .flatMap((s) =>
        s.chunks.map((c) => `[chunk:${c.id}]\n${c.content}`)
      )
      .join("\n\n");
    const truncated = contentForTopics.slice(0, 16000);

    try {
      const start = Date.now();
      const model = getModelForTask("topic_extraction");
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `You are a requirements analyst. Identify the distinct topics covered in the provided source material. Return ONLY a JSON array of objects, no other text. UK English.

Analyse the following source material and identify the distinct requirement topics covered. For each topic, estimate how much detail the sources provide.

Source material:
${truncated}

Return format:
[
  { "topic": "User authentication", "depth": "detailed", "chunkCount": 8 },
  { "topic": "Payment processing", "depth": "mentioned", "chunkCount": 2 }
]

depth values: 'detailed' (5+ chunks), 'moderate' (3-4 chunks), 'mentioned' (1-2 chunks), 'minimal' (brief mention only)`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === "text");
      const rawText = typeof textContent === "object" && "text" in textContent ? textContent.text : "";
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0]) as TopicCoverage[];
      }

      await trackModelUsage({
        workspaceId,
        model,
        task: "topic_extraction",
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs: Date.now() - start,
      });

      const minimalTopics = topics.filter((t) => t.depth === "minimal");
      if (minimalTopics.length > 0) {
        checks.push({
          name: "Topics",
          status: "warning",
          message: `Your sources have limited coverage of ${minimalTopics.map((t) => t.topic).join(", ")}. Generated stories in this area will rely heavily on inference.`,
          details: { topics },
        });
      } else {
        checks.push({
          name: "Topics",
          status: "pass",
          message: null,
          details: { topics },
        });
      }
    } catch (err) {
      console.warn("[source-readiness] Topic extraction failed:", err);
      checks.push({
        name: "Topics",
        status: "pass",
        message: null,
        details: { topics: [], error: "Analysis unavailable" },
      });
    }
  } else {
    checks.push({
      name: "Topics",
      status: "pass",
      message: null,
      details: { topics: [], skipped: !topicExtractionEnabled },
    });
  }

  // CHECK 3: Duplicate/Overlap Detection
  if (totalChunks > 1) {
    const placeholders1 = sourceIds.map((_, i) => `$${i + 1}`).join(", ");
    const placeholders2 = sourceIds.map((_, i) => `$${i + 1 + sourceIds.length}`).join(", ");
    const overlapResult = await db.$queryRawUnsafe<
      Array<{ a_id: string; b_id: string; similarity: number }>
    >(
      `SELECT a.id as a_id, b.id as b_id, 1 - (a.embedding <=> b.embedding) AS similarity
       FROM "SourceChunk" a
       CROSS JOIN "SourceChunk" b
       WHERE a."sourceId" IN (${placeholders1})
         AND b."sourceId" IN (${placeholders2})
         AND a.id < b.id
         AND a.embedding IS NOT NULL
         AND b.embedding IS NOT NULL
         AND 1 - (a.embedding <=> b.embedding) > 0.90`,
      ...sourceIds,
      ...sourceIds
    );

    const duplicateChunkIds = new Set<string>();
    for (const r of overlapResult) {
      duplicateChunkIds.add(r.a_id);
      duplicateChunkIds.add(r.b_id);
    }
    const duplicatePct = totalChunks > 0 ? (duplicateChunkIds.size / totalChunks) * 100 : 0;
    const overlapStatus = duplicatePct > 30 ? "warning" : "pass";
    checks.push({
      name: "Overlap",
      status: overlapStatus,
      message:
        duplicatePct > 30
          ? `Your sources contain significant overlap (${Math.round(duplicatePct)}% of content is duplicated). Consider removing duplicate content for better results.`
          : null,
      details: { duplicatePct, duplicateCount: duplicateChunkIds.size },
    });
  } else {
    checks.push({ name: "Overlap", status: "pass", message: null });
  }

  // CHECK 4: Source Type Suitability
  const suitabilityScores = sourcesWithEmbeddings.map(
    (s) => SOURCE_TYPE_SUITABILITY[s.type] ?? 0.5
  );
  const avgSuitability =
    suitabilityScores.length > 0
      ? suitabilityScores.reduce((a, b) => a + b, 0) / suitabilityScores.length
      : 0.5;
  const suitabilityStatus = avgSuitability < 0.6 ? "warning" : "pass";
  checks.push({
    name: "Suitability",
    status: suitabilityStatus,
    message:
      avgSuitability < 0.6
        ? "Your sources are mostly unstructured content. Story generation works best with requirements documents, meeting notes, or product briefs."
        : null,
    details: { avgSuitability, types: sourcesWithEmbeddings.map((s) => s.type) },
  });

  // CHECK 5: Chunk Embedding Quality
  const sourcesWithoutChunks = sourcesWithEmbeddings.filter((s) => s.chunks.length === 0);
  const chunksWithoutEmbeddingResult = await db.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*)::bigint as count FROM "SourceChunk" WHERE "sourceId" IN (${sourceIds.map((_, i) => `$${i + 1}`).join(", ")}) AND embedding IS NULL`,
    ...sourceIds
  );
  const chunksWithoutEmbedding = Number(chunksWithoutEmbeddingResult[0]?.count ?? 0);

  let processingStatus: "pass" | "warning" | "blocked" = "pass";
  let processingMessage: string | null = null;

  if (sourcesWithoutChunks.length > 0) {
    processingStatus = "blocked";
    processingMessage = `Source '${sourcesWithoutChunks[0]!.name}' hasn't been processed yet. Wait for processing to complete before generating.`;
  } else if (chunksWithoutEmbedding > 0) {
    processingStatus = "warning";
    processingMessage = `${chunksWithoutEmbedding} source chunks are still being processed. Generation may miss some content.`;
  }

  checks.push({
    name: "Processing",
    status: processingStatus,
    message: processingMessage,
    details: { chunksWithoutEmbedding, sourcesWithoutChunks: sourcesWithoutChunks.length },
  });

  // Aggregate
  const hasBlocked = checks.some((c) => c.status === "blocked");
  const hasWarning = checks.some((c) => c.status === "warning");
  const overallStatus = hasBlocked ? "blocked" : hasWarning ? "warnings" : "ready";

  const detailedTopics = topics.filter((t) => t.depth === "detailed").length;
  const moderateTopics = topics.filter((t) => t.depth === "moderate").length;
  const estimatedStoryCount =
    topics.length > 0
      ? Math.max(1, Math.floor(detailedTopics * 2) + Math.floor(moderateTopics))
      : Math.max(1, Math.floor(totalChunks / 2));

  const estimatedGenerationTime =
    totalTokens < 2000
      ? "About 30 seconds"
      : totalTokens < 5000
        ? "About 45 seconds"
        : totalTokens < 10000
          ? "About 60 seconds"
          : "About 90 seconds";

  return {
    overallStatus,
    checks,
    topics,
    estimatedStoryCount,
    estimatedGenerationTime,
  };
}
