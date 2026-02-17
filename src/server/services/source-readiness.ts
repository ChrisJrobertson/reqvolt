import { db } from "@/server/db";
import { getAnalysisClient, getCachedAIControls } from "@/lib/ai/model-router";

export type ReadinessStatus = "pass" | "warning" | "blocked";
export type OverallReadinessStatus = "ready" | "warnings" | "blocked";

export interface TopicCoverage {
  topic: string;
  depth: "detailed" | "moderate" | "mentioned" | "minimal";
  chunkCount: number;
}

export interface ReadinessCheck {
  name: string;
  status: ReadinessStatus;
  message: string | null;
  details?: Record<string, unknown>;
}

export interface ReadinessReport {
  overallStatus: OverallReadinessStatus;
  checks: ReadinessCheck[];
  topics: TopicCoverage[];
  estimatedStoryCount: number;
  estimatedGenerationTime: string;
}

interface AssessSourceReadinessInput {
  workspaceId: string;
  projectId: string;
  sourceIds: string[];
  userId?: string;
}

function parseJsonArray<T>(rawText: string): T[] {
  const trimmed = rawText.trim();
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const json = arrayMatch ? arrayMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function getOverallStatus(checks: ReadinessCheck[]): OverallReadinessStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warnings";
  return "ready";
}

function estimateGenerationTime(tokenCount: number): string {
  if (tokenCount < 2000) return "About 30 seconds";
  if (tokenCount < 5000) return "About 45 seconds";
  if (tokenCount < 10000) return "About 60 seconds";
  return "About 90 seconds";
}

export async function assessSourceReadiness(
  input: AssessSourceReadinessInput
): Promise<ReadinessReport> {
  const selectedSources = await db.source.findMany({
    where: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      id: { in: input.sourceIds },
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      type: true,
      content: true,
      chunks: {
        select: {
          id: true,
          content: true,
          chunkIndex: true,
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });

  const checks: ReadinessCheck[] = [];
  const chunks = selectedSources.flatMap((source) =>
    source.chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      chunkIndex: chunk.chunkIndex,
    }))
  );

  const allText = chunks.map((chunk) => chunk.content).join("\n");
  const charCount = allText.length;
  const approxTokens = Math.round(charCount / 4);
  const approxWords = Math.round(charCount / 5);

  // Check 1: Volume threshold.
  if (approxTokens < 500) {
    checks.push({
      name: "Volume",
      status: "blocked",
      message: `Your sources contain very little content (${approxWords} words). Add more detail to get useful story generation.`,
      details: { approxTokens, approxWords },
    });
  } else if (approxTokens <= 2000) {
    checks.push({
      name: "Volume",
      status: "warning",
      message: `Limited source material (${approxWords} words). Generated stories may rely on inference for some acceptance criteria.`,
      details: { approxTokens, approxWords },
    });
  } else {
    checks.push({
      name: "Volume",
      status: "pass",
      message: null,
      details: { approxTokens, approxWords },
    });
  }

  // Check 2: Topic coverage analysis (AI).
  let topics: TopicCoverage[] = [];
  const controls = await getCachedAIControls(input.workspaceId);
  if (!controls.aiTopicExtractionEnabled) {
    checks.push({
      name: "Topics",
      status: "warning",
      message:
        "Topic extraction is disabled for this workspace. Readiness analysis is using structural checks only.",
    });
  } else {
    const analysisClient = getAnalysisClient();
    const maxTopicChars = 16000;
    const sourceMaterial = chunks
      .slice(0, 80)
      .map((chunk) => `[chunk:${chunk.id}] ${chunk.content}`)
      .join("\n\n")
      .slice(0, maxTopicChars);

    const topicPrompt =
      `Analyse the following source material and identify the distinct\n` +
      `requirement topics covered. For each topic, estimate how much detail\n` +
      `the sources provide.\n\n` +
      `Source material:\n${sourceMaterial}\n\n` +
      `Return format:\n` +
      `[\n` +
      `  { "topic": "User authentication", "depth": "detailed", "chunkCount": 8 },\n` +
      `  { "topic": "Payment processing", "depth": "mentioned", "chunkCount": 2 },\n` +
      `  { "topic": "Reporting", "depth": "minimal", "chunkCount": 1 }\n` +
      `]\n\n` +
      `depth values: 'detailed' (5+ chunks), 'moderate' (3-4 chunks),\n` +
      `'mentioned' (1-2 chunks), 'minimal' (brief mention only)`;

    const topicResponse = await analysisClient.call({
      workspaceId: input.workspaceId,
      userId: input.userId,
      task: "topic_extraction",
      maxTokens: 900,
      systemPrompt:
        "You are a requirements analyst. Identify the distinct topics covered in the provided source material. Return ONLY a JSON array of objects, no other text. UK English.",
      userPrompt: topicPrompt,
      sourceIds: input.sourceIds,
      sourceChunksSent: chunks.length,
    });

    if (!topicResponse.skipped) {
      topics = parseJsonArray<TopicCoverage>(topicResponse.text)
        .filter((topic) => topic.topic && topic.depth)
        .map((topic) => ({
          topic: topic.topic,
          depth: topic.depth,
          chunkCount: Number.isFinite(topic.chunkCount) ? topic.chunkCount : 0,
        }));
    }

    const minimalTopics = topics.filter((topic) => topic.depth === "minimal");
    if (minimalTopics.length > 0) {
      checks.push({
        name: "Topics",
        status: "warning",
        message: `Your sources have limited coverage of ${minimalTopics
          .map((topic) => topic.topic)
          .join(", ")}. Generated stories in these areas will rely heavily on inference.`,
        details: { topics },
      });
    } else if (topics.length === 0) {
      checks.push({
        name: "Topics",
        status: "warning",
        message: "Topic extraction could not identify clear requirement themes from the selected sources.",
      });
    } else {
      checks.push({
        name: "Topics",
        status: "pass",
        message: null,
        details: { topics },
      });
    }
  }

  // Check 3: Duplicate/overlap detection.
  let duplicatePercentage = 0;
  if (!controls.aiEmbeddingEnabled) {
    checks.push({
      name: "Overlap",
      status: "warning",
      message:
        "Duplicate overlap detection is unavailable because embeddings are disabled for this workspace.",
    });
  } else if (input.sourceIds.length > 0) {
    const placeholderSql = input.sourceIds.map((_, index) => `$${index + 1}`).join(", ");
    const duplicatePairs = await db.$queryRawUnsafe<Array<{ aid: string; bid: string }>>(
      `SELECT a.id AS aid, b.id AS bid
       FROM "SourceChunk" a
       CROSS JOIN "SourceChunk" b
       WHERE a."sourceId" IN (${placeholderSql})
         AND b."sourceId" IN (${placeholderSql})
         AND a.id < b.id
         AND a.embedding IS NOT NULL
         AND b.embedding IS NOT NULL
         AND 1 - (a.embedding <=> b.embedding) > 0.90`,
      ...input.sourceIds
    );

    const duplicatedChunkIds = new Set<string>();
    for (const pair of duplicatePairs) {
      duplicatedChunkIds.add(pair.aid);
      duplicatedChunkIds.add(pair.bid);
    }
    duplicatePercentage = chunks.length
      ? Math.round((duplicatedChunkIds.size / chunks.length) * 100)
      : 0;
  }

    if (duplicatePercentage > 30) {
      checks.push({
        name: "Overlap",
        status: "warning",
        message: `Your sources contain significant overlap (${duplicatePercentage}% of content is duplicated). Consider removing duplicate content for better results.`,
        details: { duplicatePercentage },
      });
    } else {
      checks.push({
        name: "Overlap",
        status: "pass",
        message: null,
        details: { duplicatePercentage },
      });
    }
  }

  // Check 4: Source type suitability.
  const suitabilityScoreByType: Record<string, number> = {
    PDF: 1.0,
    DOCX: 1.0,
    MEETING_NOTES: 0.9,
    EMAIL: 0.7,
    TRANSCRIPT: 0.7,
    INTERVIEW_TRANSCRIPT: 0.7,
    OTHER: 0.5,
  };
  const suitabilityScores = selectedSources.map(
    (source) => suitabilityScoreByType[source.type] ?? 0.5
  );
  const suitabilityAverage = suitabilityScores.length
    ? suitabilityScores.reduce((sum, value) => sum + value, 0) / suitabilityScores.length
    : 0;

  if (suitabilityAverage < 0.6) {
    checks.push({
      name: "Suitability",
      status: "warning",
      message:
        "Your sources are mostly unstructured content. Story generation works best with requirements documents, meeting notes, or product briefs.",
      details: { suitabilityAverage },
    });
  } else {
    checks.push({
      name: "Suitability",
      status: "pass",
      message: null,
      details: { suitabilityAverage },
    });
  }

  // Check 5: Chunk embedding quality.
  const sourceWithNoChunks = selectedSources.filter((source) => source.chunks.length === 0);
  if (!controls.aiEmbeddingEnabled) {
    checks.push({
      name: "Processing",
      status: "warning",
      message:
        "Embedding generation is disabled for this workspace. Semantic search and evidence linking will be unavailable.",
      details: { sourceCount: selectedSources.length },
    });
  } else if (sourceWithNoChunks.length > 0) {
    checks.push({
      name: "Processing",
      status: "blocked",
      message: `Source '${sourceWithNoChunks[0]!.name}' hasn't been processed yet. Wait for processing to complete before generating.`,
      details: { sourceCountWithoutChunks: sourceWithNoChunks.length },
    });
  } else {
    const placeholderSql = input.sourceIds.map((_, index) => `$${index + 1}`).join(", ");
    const [{ total_chunks, embedded_chunks }] = await db.$queryRawUnsafe<
      Array<{ total_chunks: bigint; embedded_chunks: bigint }>
    >(
      `SELECT
         COUNT(*)::bigint AS total_chunks,
         COUNT(*) FILTER (WHERE embedding IS NOT NULL)::bigint AS embedded_chunks
       FROM "SourceChunk"
       WHERE "sourceId" IN (${placeholderSql})`,
      ...input.sourceIds
    );
    const totalChunks = Number(total_chunks);
    const embeddedChunks = Number(embedded_chunks);
    const pendingEmbeddings = Math.max(0, totalChunks - embeddedChunks);

    if (pendingEmbeddings > 0) {
      checks.push({
        name: "Processing",
        status: "warning",
        message: `${pendingEmbeddings} source chunks are still being processed. Generation may miss some content.`,
        details: { totalChunks, embeddedChunks },
      });
    } else {
      checks.push({
        name: "Processing",
        status: "pass",
        message: null,
        details: { totalChunks, embeddedChunks },
      });
    }
  }

  const detailedTopicCount = topics.filter((topic) => topic.depth === "detailed").length;
  const moderateTopicCount = topics.filter((topic) => topic.depth === "moderate").length;
  const estimatedStoryCount = Math.max(
    1,
    Math.ceil(detailedTopicCount / 2) + moderateTopicCount
  );

  return {
    overallStatus: getOverallStatus(checks),
    checks,
    topics,
    estimatedStoryCount,
    estimatedGenerationTime: estimateGenerationTime(approxTokens),
  };
}
