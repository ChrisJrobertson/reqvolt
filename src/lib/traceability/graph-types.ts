export type TraceConfidence = "direct" | "inferred" | "assumption";

export type TraceNodeKind = "source" | "story" | "ac" | "evidence" | "chunk";

export type TraceEdgeType =
  | "source-to-story"
  | "story-to-ac"
  | "ac-to-evidence"
  | "evidence-to-chunk";

export interface TraceabilitySourceNodeData {
  id: string;
  name: string;
  sourceType: string;
  chunkCount: number;
  fileSize: string;
}

export interface TraceabilityStoryNodeData {
  id: string;
  storyIndex: number;
  persona: string;
  want: string;
  acCount: number;
  acWithEvidenceCount: number;
  evidenceCoverage: number;
  qualityScore: number;
}

export interface TraceabilityACNodeData {
  id: string;
  criterionIndex: number;
  given: string;
  when: string;
  then: string;
  evidenceCount: number;
  strongestConfidence: TraceConfidence | "none";
}

export interface TraceabilityEvidenceNodeData {
  id: string;
  confidence: TraceConfidence;
  snippet: string;
  sourceName: string;
  sourceId: string;
}

export interface TraceabilityChunkNodeData {
  id: string;
  snippet: string;
  sourceName: string;
  sourceId: string;
  sourceType: string;
  chunkIndex: number;
  chunkCount?: number;
  isSummary?: boolean;
}

export type TraceabilityNodeData =
  | TraceabilitySourceNodeData
  | TraceabilityStoryNodeData
  | TraceabilityACNodeData
  | TraceabilityEvidenceNodeData
  | TraceabilityChunkNodeData;

export interface TraceabilityGraphNode {
  id: string;
  kind: TraceNodeKind;
  data: TraceabilityNodeData;
}

export interface TraceabilityGraphEdge {
  id: string;
  source: string;
  target: string;
  edgeType: TraceEdgeType;
  confidence?: TraceConfidence;
  label?: string;
}

export interface TraceabilityGraphStats {
  sources: number;
  stories: number;
  acceptanceCriteria: number;
  evidenceLinks: number;
  chunks: number;
  coverage: number;
}

export interface TraceabilityGraphPayload {
  packId: string;
  packName: string;
  packVersionId: string;
  versionNumber: number;
  generatedAt: string;
  nodes: TraceabilityGraphNode[];
  edges: TraceabilityGraphEdge[];
  stats: TraceabilityGraphStats;
}

export const TRACE_CONFIDENCE_PRIORITY: Record<TraceConfidence | "none", number> = {
  none: 0,
  assumption: 1,
  inferred: 2,
  direct: 3,
};
