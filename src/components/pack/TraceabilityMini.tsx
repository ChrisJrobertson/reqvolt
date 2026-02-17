"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dagre from "@dagrejs/dagre";
import { ReactFlow, type ReactFlowInstance } from "@xyflow/react";
import type {
  TraceConfidence,
  TraceabilityGraphEdge,
  TraceabilityGraphNode,
  TraceabilityGraphPayload,
} from "@/lib/traceability/graph-types";
import { trpc } from "@/lib/trpc";
import { getNodeTokens, type GraphTheme } from "./traceability/graph-tokens";
import { SourceNode } from "./traceability/SourceNode";
import { StoryNode } from "./traceability/StoryNode";
import { ACNode } from "./traceability/ACNode";
import { EvidenceNode } from "./traceability/EvidenceNode";
import { ChunkNode } from "./traceability/ChunkNode";
import { TracedEdge } from "./traceability/TracedEdge";
import type {
  TraceabilityFlowNodeData,
  TraceFlowEdge,
  TraceFlowNode,
  SourceNodeData,
  StoryNodeData,
  ACNodeData,
  EvidenceNodeData,
  ChunkNodeData,
} from "./traceability/node-types";

const MINI_NODE_TYPES = {
  source: SourceNode,
  story: StoryNode,
  ac: ACNode,
  evidence: EvidenceNode,
  chunk: ChunkNode,
};

const MINI_EDGE_TYPES = {
  traced: TracedEdge,
};

interface TraceabilityMiniProps {
  workspaceId: string;
  projectId: string;
  packId: string;
  graph?: TraceabilityGraphPayload;
}

function getEvidenceConfidence(node: TraceabilityGraphNode): TraceConfidence | undefined {
  if (node.kind !== "evidence") return undefined;
  const data = node.data as { confidence: TraceConfidence };
  return data.confidence;
}

function miniLayout(nodes: TraceabilityGraphNode[], edges: TraceabilityGraphEdge[], theme: GraphTheme) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 72,
    nodesep: 28,
    edgesep: 12,
    marginx: 18,
    marginy: 18,
    ranker: "network-simplex",
  });

  for (const node of nodes) {
    const tokens = getNodeTokens(node.kind, theme, getEvidenceConfidence(node));
    graph.setNode(node.id, {
      width: Math.round(tokens.width * 0.9),
      height: Math.round(tokens.height * 0.9),
    });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  return nodes.map((node) => {
    const meta = graph.node(node.id) as { x: number; y: number; width: number; height: number };
    return {
      node,
      x: meta.x - meta.width / 2,
      y: meta.y - meta.height / 2,
    };
  });
}

function getCoverageClass(coverage: number): string {
  if (coverage > 80) return "bg-green-500";
  if (coverage >= 60) return "bg-amber-500";
  return "bg-red-500";
}

export function TraceabilityMini({ workspaceId, projectId, packId, graph }: TraceabilityMiniProps) {
  const [theme] = useState<GraphTheme>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<TraceFlowNode, TraceFlowEdge> | null>(null);

  const query = trpc.pack.getTraceabilityGraph.useQuery(
    { packId },
    { enabled: !graph, staleTime: 60_000 }
  );
  const payload = graph ?? (query.data as TraceabilityGraphPayload | undefined);

  const graphData = useMemo(() => {
    if (!payload) return null;
    const subsetNodes = payload.nodes.filter(
      (node) =>
        node.kind !== "chunk" ||
        ((node.data as { chunkIndex?: number }).chunkIndex ?? 0) < 1
    );
    const subsetNodeIds = new Set(subsetNodes.map((node) => node.id));
    const subsetEdges = payload.edges.filter(
      (edge) => subsetNodeIds.has(edge.source) && subsetNodeIds.has(edge.target)
    );
    return { nodes: subsetNodes, edges: subsetEdges };
  }, [payload]);

  const layoutedNodes = useMemo(
    () => (graphData ? miniLayout(graphData.nodes, graphData.edges, theme) : []),
    [graphData, theme]
  );

  const flowNodes = useMemo<TraceFlowNode[]>(() => {
    return layoutedNodes.map((entry) => {
      const visual = {
        isHighlighted: false,
        isDimmed: false,
        isSelected: false,
        theme,
        presentationMode: false,
        miniMode: true,
        onSelect: undefined,
      };
      let data: TraceabilityFlowNodeData;
      if (entry.node.kind === "source") {
        data = {
          ...(entry.node.data as unknown as Record<string, unknown>),
          ...visual,
        } as SourceNodeData;
      } else if (entry.node.kind === "story") {
        data = {
          ...(entry.node.data as unknown as Record<string, unknown>),
          ...visual,
        } as StoryNodeData;
      } else if (entry.node.kind === "ac") {
        data = {
          ...(entry.node.data as unknown as Record<string, unknown>),
          ...visual,
        } as ACNodeData;
      } else if (entry.node.kind === "evidence") {
        data = {
          ...(entry.node.data as unknown as Record<string, unknown>),
          ...visual,
        } as EvidenceNodeData;
      } else {
        data = {
          ...(entry.node.data as unknown as Record<string, unknown>),
          ...visual,
        } as ChunkNodeData;
      }
      return {
        id: entry.node.id,
        type: entry.node.kind,
        position: { x: entry.x, y: entry.y },
        data,
        draggable: false,
        selectable: false,
      } as TraceFlowNode;
    });
  }, [layoutedNodes, theme]);

  const flowEdges = useMemo<TraceFlowEdge[]>(() => {
    if (!graphData) return [];
    return graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "traced",
      data: {
        edgeType: edge.edgeType,
        confidence: edge.confidence,
        isHighlighted: false,
        isDimmed: false,
        animate: false,
        showLabel: false,
        label: edge.label,
        theme,
        presentationMode: false,
      } as Record<string, unknown>,
    })) as TraceFlowEdge[];
  }, [graphData, theme]);

  useEffect(() => {
    if (!flowInstance || flowNodes.length === 0) return;
    flowInstance.fitView({ padding: 0.2, maxZoom: 1, duration: 240 });
  }, [flowEdges.length, flowInstance, flowNodes.length]);

  if (!payload || !graphData) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">Loading traceability preview…</p>
      </div>
    );
  }

  const coverageClass = getCoverageClass(payload.stats.coverage);

  return (
    <Link
      href={`/workspace/${workspaceId}/projects/${projectId}/packs/${packId}/traceability`}
      className="block rounded-xl border bg-background p-3 transition-transform duration-200 hover:scale-[1.01] hover:shadow-lg"
    >
      <div className="h-[180px] w-[300px] overflow-hidden rounded-lg border bg-background">
        <div
          style={{
            width: "250%",
            height: "250%",
            transform: "scale(0.4)",
            transformOrigin: "top left",
          }}
        >
          <ReactFlow<TraceFlowNode, TraceFlowEdge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={MINI_NODE_TYPES}
            edgeTypes={MINI_EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            onInit={setFlowInstance}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </div>

      <div className="mt-3 text-sm">
        <p className="text-muted-foreground">
          📄 {payload.stats.sources} Sources → 📖 {payload.stats.stories} Stories → ✓{" "}
          {payload.stats.acceptanceCriteria} ACs
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Evidence coverage: {payload.stats.coverage}%</span>
          <div className="h-1 w-36 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${coverageClass}`} style={{ width: `${payload.stats.coverage}%` }} />
          </div>
        </div>
        <div className="mt-2 text-right text-sm font-medium">View →</div>
      </div>
    </Link>
  );
}
