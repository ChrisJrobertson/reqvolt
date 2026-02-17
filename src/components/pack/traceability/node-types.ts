import type { TraceConfidence, TraceEdgeType } from "@/lib/traceability/graph-types";
import type { Edge, Node } from "@xyflow/react";
import type { GraphTheme } from "./graph-tokens";

interface SharedNodeVisualData {
  [key: string]: unknown;
  isHighlighted: boolean;
  isDimmed: boolean;
  isSelected: boolean;
  theme: GraphTheme;
  presentationMode: boolean;
  miniMode: boolean;
  onSelect?: (nodeId: string) => void;
}

export interface SourceNodeData extends SharedNodeVisualData {
  id: string;
  name: string;
  sourceType: string;
  chunkCount: number;
  fileSize: string;
}

export interface StoryNodeData extends SharedNodeVisualData {
  id: string;
  storyIndex: number;
  persona: string;
  want: string;
  acCount: number;
  acWithEvidenceCount: number;
  evidenceCoverage: number;
  qualityScore: number;
}

export interface ACNodeData extends SharedNodeVisualData {
  id: string;
  criterionIndex: number;
  given: string;
  when: string;
  then: string;
  evidenceCount: number;
  strongestConfidence: TraceConfidence | "none";
}

export interface EvidenceNodeData extends SharedNodeVisualData {
  id: string;
  confidence: TraceConfidence;
  snippet: string;
  sourceName: string;
}

export interface ChunkNodeData extends SharedNodeVisualData {
  id: string;
  snippet: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  chunkCount?: number;
  isSummary?: boolean;
}

export type TraceabilityFlowNodeData =
  | SourceNodeData
  | StoryNodeData
  | ACNodeData
  | EvidenceNodeData
  | ChunkNodeData;

export interface TracedEdgeData {
  [key: string]: unknown;
  edgeType: TraceEdgeType;
  confidence?: TraceConfidence;
  isHighlighted: boolean;
  isDimmed: boolean;
  animate: boolean;
  showLabel: boolean;
  label?: string;
  theme: GraphTheme;
  presentationMode: boolean;
}

export type SourceFlowNode = Node<SourceNodeData, "source">;
export type StoryFlowNode = Node<StoryNodeData, "story">;
export type ACFlowNode = Node<ACNodeData, "ac">;
export type EvidenceFlowNode = Node<EvidenceNodeData, "evidence">;
export type ChunkFlowNode = Node<ChunkNodeData, "chunk">;

export type TraceFlowNode =
  | SourceFlowNode
  | StoryFlowNode
  | ACFlowNode
  | EvidenceFlowNode
  | ChunkFlowNode;

export type TraceFlowEdge = Edge<TracedEdgeData, "traced">;
