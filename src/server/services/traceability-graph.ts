import type { ConfidenceLevel, EvidenceEntityType, QASeverity } from "@prisma/client";
import { db } from "@/server/db";
import type {
  TraceConfidence,
  TraceabilityGraphPayload,
  TraceabilityGraphNode,
  TraceabilityGraphEdge,
} from "@/lib/traceability/graph-types";
import { TRACE_CONFIDENCE_PRIORITY } from "@/lib/traceability/graph-types";

interface BuildTraceabilityGraphArgs {
  workspaceId: string;
  packId: string;
  packVersionId?: string;
}

function mapConfidence(confidence: ConfidenceLevel): TraceConfidence {
  if (confidence === "high") return "direct";
  if (confidence === "medium") return "inferred";
  return "assumption";
}

function confidenceLabelToText(confidence: TraceConfidence): string {
  if (confidence === "direct") return "Direct";
  if (confidence === "inferred") return "Inferred";
  return "Assumption";
}

function toFileSizeLabel(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getQAPenaltyWeight(severity: QASeverity): number {
  if (severity === "high") return 14;
  if (severity === "medium") return 8;
  return 4;
}

function getStrongestConfidence(confidences: TraceConfidence[]): TraceConfidence | "none" {
  let strongest: TraceConfidence | "none" = "none";
  for (const confidence of confidences) {
    if (TRACE_CONFIDENCE_PRIORITY[confidence] > TRACE_CONFIDENCE_PRIORITY[strongest]) {
      strongest = confidence;
    }
  }
  return strongest;
}

export async function buildTraceabilityGraphData(
  args: BuildTraceabilityGraphArgs
): Promise<TraceabilityGraphPayload> {
  const pack = await db.pack.findFirst({
    where: { id: args.packId, workspaceId: args.workspaceId },
    select: {
      id: true,
      name: true,
      versions: {
        where: args.packVersionId ? { id: args.packVersionId } : undefined,
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          versionNumber: true,
          sourceIds: true,
          qaFlags: {
            where: { resolvedBy: null },
            select: {
              entityType: true,
              entityId: true,
              severity: true,
            },
          },
          stories: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              sortOrder: true,
              persona: true,
              want: true,
              acceptanceCriteria: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  sortOrder: true,
                  given: true,
                  when: true,
                  then: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const version = pack?.versions[0];
  if (!pack || !version) {
    throw new Error("Pack not found");
  }

  const configuredSourceIds = Array.isArray(version.sourceIds)
    ? (version.sourceIds as string[])
    : [];
  const configuredSourceSet = new Set(configuredSourceIds);

  const sources = configuredSourceIds.length
    ? await db.source.findMany({
        where: {
          id: { in: configuredSourceIds },
          workspaceId: args.workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          content: true,
          _count: { select: { chunks: true } },
        },
      })
    : [];

  const sourceById = new Map(
    sources.map((source) => [
      source.id,
      {
        id: source.id,
        name: source.name,
        type: source.type,
        chunkCount: source._count.chunks,
        fileSize: toFileSizeLabel(source.content),
      },
    ])
  );

  const stories = version.stories;
  const storyIds = stories.map((story) => story.id);
  const acRows = stories.flatMap((story) => story.acceptanceCriteria);
  const acIds = acRows.map((ac) => ac.id);

  const entityIds = [...storyIds, ...acIds];
  const evidenceLinks = entityIds.length
    ? await db.evidenceLink.findMany({
        where: {
          entityType: { in: ["story", "acceptance_criteria"] },
          entityId: { in: entityIds },
        },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          confidence: true,
          sourceChunk: {
            select: {
              id: true,
              content: true,
              chunkIndex: true,
              source: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      })
    : [];

  for (const link of evidenceLinks) {
    if (sourceById.has(link.sourceChunk.source.id)) continue;
    sourceById.set(link.sourceChunk.source.id, {
      id: link.sourceChunk.source.id,
      name: link.sourceChunk.source.name,
      type: link.sourceChunk.source.type,
      chunkCount: 0,
      fileSize: "Unknown",
    });
  }

  const storyEvidenceMap = new Map<string, typeof evidenceLinks>();
  const acEvidenceMap = new Map<string, typeof evidenceLinks>();
  for (const link of evidenceLinks) {
    if (link.entityType === "story") {
      const existing = storyEvidenceMap.get(link.entityId) ?? [];
      existing.push(link);
      storyEvidenceMap.set(link.entityId, existing);
      continue;
    }
    const existing = acEvidenceMap.get(link.entityId) ?? [];
    existing.push(link);
    acEvidenceMap.set(link.entityId, existing);
  }

  const sourceNodes: TraceabilityGraphNode[] = [];
  const unorderedSourceIds = Array.from(sourceById.keys()).filter(
    (sourceId) => !configuredSourceSet.has(sourceId)
  );
  const orderedSourceIds = [...configuredSourceIds, ...unorderedSourceIds];

  for (const sourceId of orderedSourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) continue;
    sourceNodes.push({
      id: `source:${source.id}`,
      kind: "source",
      data: {
        id: source.id,
        name: source.name,
        sourceType: source.type,
        chunkCount: source.chunkCount,
        fileSize: source.fileSize,
      },
    });
  }

  const storyToACIds = new Map<string, string[]>();
  for (const story of stories) {
    storyToACIds.set(
      story.id,
      story.acceptanceCriteria.map((ac) => ac.id)
    );
  }

  const qaPenaltyByStory = new Map<string, number>();
  for (const story of stories) {
    const acIdSet = new Set(story.acceptanceCriteria.map((ac) => ac.id));
    const totalPenalty = version.qaFlags.reduce((carry, flag) => {
      const isStoryFlag =
        flag.entityType === ("story" as EvidenceEntityType) && flag.entityId === story.id;
      const isAcFlag =
        flag.entityType === ("acceptance_criteria" as EvidenceEntityType) &&
        acIdSet.has(flag.entityId);
      if (!isStoryFlag && !isAcFlag) return carry;
      return carry + getQAPenaltyWeight(flag.severity);
    }, 0);
    qaPenaltyByStory.set(story.id, totalPenalty);
  }

  const storyNodes: TraceabilityGraphNode[] = stories.map((story) => {
    const acs = story.acceptanceCriteria;
    const acWithEvidenceCount = acs.filter((ac) => (acEvidenceMap.get(ac.id)?.length ?? 0) > 0)
      .length;
    const evidenceCoverage =
      acs.length === 0 ? 0 : Math.round((acWithEvidenceCount / acs.length) * 100);
    const qaPenalty = qaPenaltyByStory.get(story.id) ?? 0;
    const qualityScore = clamp(evidenceCoverage - qaPenalty, 0, 100);
    return {
      id: `story:${story.id}`,
      kind: "story",
      data: {
        id: story.id,
        storyIndex: story.sortOrder + 1,
        persona: story.persona,
        want: story.want,
        acCount: acs.length,
        acWithEvidenceCount,
        evidenceCoverage,
        qualityScore,
      },
    };
  });

  const acNodes: TraceabilityGraphNode[] = stories.flatMap((story) =>
    story.acceptanceCriteria.map((ac) => {
      const acEvidenceLinks = acEvidenceMap.get(ac.id) ?? [];
      const strongestConfidence = getStrongestConfidence(
        acEvidenceLinks.map((link) => mapConfidence(link.confidence))
      );
      return {
        id: `ac:${ac.id}`,
        kind: "ac",
        data: {
          id: ac.id,
          criterionIndex: ac.sortOrder + 1,
          given: ac.given,
          when: ac.when,
          then: ac.then,
          evidenceCount: acEvidenceLinks.length,
          strongestConfidence,
        },
      };
    })
  );

  const evidenceNodes: TraceabilityGraphNode[] = evidenceLinks.map((link) => {
    const confidence = mapConfidence(link.confidence);
    return {
      id: `evidence:${link.id}`,
      kind: "evidence",
      data: {
        id: link.id,
        confidence,
        snippet: link.sourceChunk.content.slice(0, 280),
        sourceName: link.sourceChunk.source.name,
        sourceId: link.sourceChunk.source.id,
      },
    };
  });

  const chunkById = new Map<string, TraceabilityGraphNode>();
  for (const link of evidenceLinks) {
    const chunkId = link.sourceChunk.id;
    if (chunkById.has(chunkId)) continue;
    chunkById.set(chunkId, {
      id: `chunk:${chunkId}`,
      kind: "chunk",
      data: {
        id: chunkId,
        snippet: link.sourceChunk.content.slice(0, 280),
        sourceName: link.sourceChunk.source.name,
        sourceId: link.sourceChunk.source.id,
        sourceType: link.sourceChunk.source.type,
        chunkIndex: link.sourceChunk.chunkIndex,
      },
    });
  }
  const chunkNodes = Array.from(chunkById.values());

  const edgeMap = new Map<string, TraceabilityGraphEdge>();

  const storyToSourceIds = new Map<string, Set<string>>();
  for (const story of stories) {
    const combined = [
      ...(storyEvidenceMap.get(story.id) ?? []),
      ...story.acceptanceCriteria.flatMap((ac) => acEvidenceMap.get(ac.id) ?? []),
    ];
    if (!combined.length) continue;
    const sourceIds = new Set(combined.map((link) => link.sourceChunk.source.id));
    storyToSourceIds.set(story.id, sourceIds);
  }

  for (const [storyId, sourceIds] of storyToSourceIds.entries()) {
    for (const sourceId of sourceIds) {
      const edgeId = `edge:source-story:${sourceId}:${storyId}`;
      edgeMap.set(edgeId, {
        id: edgeId,
        source: `source:${sourceId}`,
        target: `story:${storyId}`,
        edgeType: "source-to-story",
        label: "informs",
      });
    }
  }

  for (const story of stories) {
    for (const ac of story.acceptanceCriteria) {
      const edgeId = `edge:story-ac:${story.id}:${ac.id}`;
      edgeMap.set(edgeId, {
        id: edgeId,
        source: `story:${story.id}`,
        target: `ac:${ac.id}`,
        edgeType: "story-to-ac",
        label: "defines",
      });
    }
  }

  for (const link of evidenceLinks) {
    const confidence = mapConfidence(link.confidence);
    const relationSource =
      link.entityType === "story" ? `story:${link.entityId}` : `ac:${link.entityId}`;
    const toEvidenceEdgeId = `edge:entity-evidence:${relationSource}:${link.id}`;
    edgeMap.set(toEvidenceEdgeId, {
      id: toEvidenceEdgeId,
      source: relationSource,
      target: `evidence:${link.id}`,
      edgeType: "ac-to-evidence",
      confidence,
      label: `supported by ${confidenceLabelToText(confidence).toLowerCase()}`,
    });

    const toChunkEdgeId = `edge:evidence-chunk:${link.id}:${link.sourceChunk.id}`;
    edgeMap.set(toChunkEdgeId, {
      id: toChunkEdgeId,
      source: `evidence:${link.id}`,
      target: `chunk:${link.sourceChunk.id}`,
      edgeType: "evidence-to-chunk",
      confidence,
      label: "references",
    });
  }

  const nodes = [...sourceNodes, ...storyNodes, ...acNodes, ...evidenceNodes, ...chunkNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.from(edgeMap.values()).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );

  const totalAcs = acRows.length;
  const coveredAcs = acRows.filter((ac) => (acEvidenceMap.get(ac.id)?.length ?? 0) > 0).length;
  const coverage = totalAcs === 0 ? 0 : Math.round((coveredAcs / totalAcs) * 100);

  return {
    packId: pack.id,
    packName: pack.name,
    packVersionId: version.id,
    versionNumber: version.versionNumber,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: {
      sources: sourceNodes.length,
      stories: storyNodes.length,
      acceptanceCriteria: acNodes.length,
      evidenceLinks: evidenceNodes.length,
      chunks: chunkNodes.length,
      coverage,
    },
  };
}
