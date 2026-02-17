"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import type {
  TraceConfidence,
  TraceabilityGraphEdge,
  TraceabilityGraphNode,
  TraceabilityGraphPayload,
} from "@/lib/traceability/graph-types";
import { getNodeTokens, type GraphTheme } from "./traceability/graph-tokens";
import type {
  TraceabilityFlowNodeData,
  TraceFlowEdge,
  TraceFlowNode,
  ChunkNodeData,
  SourceNodeData,
  StoryNodeData,
  ACNodeData,
  EvidenceNodeData,
} from "./traceability/node-types";
import { SourceNode } from "./traceability/SourceNode";
import { StoryNode } from "./traceability/StoryNode";
import { ACNode } from "./traceability/ACNode";
import { EvidenceNode } from "./traceability/EvidenceNode";
import { ChunkNode } from "./traceability/ChunkNode";
import { TracedEdge } from "./traceability/TracedEdge";
import { GraphStats } from "./traceability/GraphStats";
import {
  PresentationMode,
  type PresentationFilters,
} from "./traceability/PresentationMode";

type StatFilterType = "source" | "story" | "ac" | "evidence" | "chunk";

const DEFAULT_FILTERS: PresentationFilters = {
  nodeTypes: {
    source: true,
    story: true,
    ac: true,
    evidence: true,
    chunk: true,
  },
  confidences: {
    direct: true,
    inferred: true,
    assumption: true,
  },
};

const nodeTypes = {
  source: SourceNode,
  story: StoryNode,
  ac: ACNode,
  evidence: EvidenceNode,
  chunk: ChunkNode,
};

const edgeTypes = {
  traced: TracedEdge,
};

interface LayoutedNode {
  node: TraceabilityGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TraceabilityGraphProps {
  graph: TraceabilityGraphPayload;
}

function getEvidenceConfidence(node: TraceabilityGraphNode): TraceConfidence | undefined {
  if (node.kind !== "evidence") return undefined;
  const data = node.data as { confidence: TraceConfidence };
  return data.confidence;
}

function toFilterType(kind: TraceabilityGraphNode["kind"]): StatFilterType {
  if (kind === "source") return "source";
  if (kind === "story") return "story";
  if (kind === "ac") return "ac";
  if (kind === "evidence") return "evidence";
  return "chunk";
}

function getNodeDimensions(node: TraceabilityGraphNode, theme: GraphTheme) {
  const tokens = getNodeTokens(node.kind, theme, getEvidenceConfidence(node));
  return { width: tokens.width, height: tokens.height };
}

function collectConnectedWithinTwoHops(startNodeId: string, edges: TraceabilityGraphEdge[]) {
  const nodeIds = new Set<string>([startNodeId]);
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();

  for (const edge of edges) {
    const sourceNeighbours = adjacency.get(edge.source) ?? [];
    sourceNeighbours.push({ nodeId: edge.target, edgeId: edge.id });
    adjacency.set(edge.source, sourceNeighbours);

    const targetNeighbours = adjacency.get(edge.target) ?? [];
    targetNeighbours.push({ nodeId: edge.source, edgeId: edge.id });
    adjacency.set(edge.target, targetNeighbours);
  }

  const queue: Array<{ nodeId: string; hops: number }> = [{ nodeId: startNodeId, hops: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (current.hops >= 2) continue;
    const neighbours = adjacency.get(current.nodeId) ?? [];
    for (const neighbour of neighbours) {
      edgeIds.add(neighbour.edgeId);
      if (nodeIds.has(neighbour.nodeId)) continue;
      nodeIds.add(neighbour.nodeId);
      queue.push({ nodeId: neighbour.nodeId, hops: current.hops + 1 });
    }
  }

  return { nodeIds, edgeIds };
}

function collapseChunkNodes(
  nodes: TraceabilityGraphNode[],
  edges: TraceabilityGraphEdge[]
): { nodes: TraceabilityGraphNode[]; edges: TraceabilityGraphEdge[] } {
  const nonChunkNodes = nodes.filter((node) => node.kind !== "chunk");
  const chunkNodes = nodes.filter((node) => node.kind === "chunk");
  if (chunkNodes.length === 0) return { nodes, edges };

  const chunkSummaryBySource = new Map<string, TraceabilityGraphNode>();
  const edgeMap = new Map<string, TraceabilityGraphEdge>();

  for (const edge of edges) {
    if (edge.edgeType !== "evidence-to-chunk") {
      edgeMap.set(edge.id, edge);
      continue;
    }
    const chunkNode = chunkNodes.find((node) => node.id === edge.target);
    if (!chunkNode) continue;
    const chunkData = chunkNode.data as { sourceId: string; sourceName: string; sourceType: string };
    const summaryId = `chunk-summary:${chunkData.sourceId}`;
    if (!chunkSummaryBySource.has(summaryId)) {
      const sourceChunks = chunkNodes.filter(
        (node) => (node.data as { sourceId: string }).sourceId === chunkData.sourceId
      );
      chunkSummaryBySource.set(summaryId, {
        id: summaryId,
        kind: "chunk",
        data: {
          id: summaryId,
          snippet: `${sourceChunks.length} chunks`,
          sourceName: chunkData.sourceName,
          sourceId: chunkData.sourceId,
          sourceType: chunkData.sourceType,
          chunkIndex: 0,
          chunkCount: sourceChunks.length,
          isSummary: true,
        },
      });
    }
    const summaryEdgeId = `edge:evidence-summary:${edge.source}:${summaryId}`;
    edgeMap.set(summaryEdgeId, {
      id: summaryEdgeId,
      source: edge.source,
      target: summaryId,
      edgeType: "evidence-to-chunk",
      confidence: edge.confidence,
      label: edge.label,
    });
  }

  return {
    nodes: [...nonChunkNodes, ...Array.from(chunkSummaryBySource.values())],
    edges: Array.from(edgeMap.values()),
  };
}

function applyPresentationFilters(
  nodes: TraceabilityGraphNode[],
  edges: TraceabilityGraphEdge[],
  filters: PresentationFilters
) {
  const visibleNodes = nodes.filter((node) => {
    if (node.kind === "source" && !filters.nodeTypes.source) return false;
    if (node.kind === "story" && !filters.nodeTypes.story) return false;
    if (node.kind === "ac" && !filters.nodeTypes.ac) return false;
    if (node.kind === "chunk" && !filters.nodeTypes.chunk) return false;
    if (node.kind === "evidence") {
      if (!filters.nodeTypes.evidence) return false;
      const confidence = (node.data as { confidence: TraceConfidence }).confidence;
      if (confidence === "direct" && !filters.confidences.direct) return false;
      if (confidence === "inferred" && !filters.confidences.inferred) return false;
      if (confidence === "assumption" && !filters.confidences.assumption) return false;
    }
    return true;
  });

  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  return { nodes: visibleNodes, edges: visibleEdges };
}

function layoutGraph(
  nodes: TraceabilityGraphNode[],
  edges: TraceabilityGraphEdge[],
  theme: GraphTheme
): { nodes: LayoutedNode[]; edges: TraceabilityGraphEdge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: "LR",
    ranksep: 120,
    nodesep: 40,
    edgesep: 20,
    marginx: 60,
    marginy: 60,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });

  for (const node of nodes) {
    const { width, height } = getNodeDimensions(node, theme);
    dagreGraph.setNode(node.id, { width, height });
  }
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const dims = dagreGraph.node(node.id) as { x: number; y: number; width: number; height: number };
    return {
      node,
      x: dims.x - dims.width / 2,
      y: dims.y - dims.height / 2,
      width: dims.width,
      height: dims.height,
    };
  });

  layoutedNodes.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  return { nodes: layoutedNodes, edges };
}

function getNodePanelContent(node: TraceabilityGraphNode): ReactNode {
  if (node.kind === "source") {
    const data = node.data as { name: string; sourceType: string; chunkCount: number; fileSize: string };
    return (
      <>
        <h3 className="text-sm font-semibold">Source</h3>
        <p className="mt-2 text-sm">{data.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.sourceType} · {data.chunkCount} chunks · {data.fileSize}
        </p>
      </>
    );
  }
  if (node.kind === "story") {
    const data = node.data as { storyIndex: number; persona: string; want: string; evidenceCoverage: number };
    return (
      <>
        <h3 className="text-sm font-semibold">Story S{data.storyIndex}</h3>
        <p className="mt-2 text-sm">As a {data.persona}</p>
        <p className="mt-1 text-sm text-muted-foreground">I want to {data.want}</p>
        <p className="mt-2 text-xs text-muted-foreground">Evidence coverage: {data.evidenceCoverage}%</p>
      </>
    );
  }
  if (node.kind === "ac") {
    const data = node.data as { criterionIndex: number; given: string; when: string; then: string; evidenceCount: number };
    return (
      <>
        <h3 className="text-sm font-semibold">Acceptance criterion {data.criterionIndex}</h3>
        <p className="mt-2 text-xs">
          <strong>Given</strong> {data.given}
        </p>
        <p className="mt-1 text-xs">
          <strong>When</strong> {data.when}
        </p>
        <p className="mt-1 text-xs">
          <strong>Then</strong> {data.then}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{data.evidenceCount} evidence links</p>
      </>
    );
  }
  if (node.kind === "evidence") {
    const data = node.data as { confidence: TraceConfidence; snippet: string; sourceName: string };
    return (
      <>
        <h3 className="text-sm font-semibold">Evidence</h3>
        <p className="mt-2 text-xs text-muted-foreground">Source: {data.sourceName}</p>
        <p className="mt-1 text-xs text-muted-foreground">Confidence: {data.confidence}</p>
        <p className="mt-2 text-sm leading-relaxed">{data.snippet}</p>
      </>
    );
  }
  const data = node.data as { snippet: string; sourceName: string; sourceType: string; chunkIndex: number; isSummary?: boolean; chunkCount?: number };
  return (
    <>
      <h3 className="text-sm font-semibold">Source chunk</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {data.sourceName} · {data.sourceType}
      </p>
      {data.isSummary ? (
        <p className="mt-1 text-sm">{data.chunkCount ?? 0} chunks collapsed for performance.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">Paragraph {data.chunkIndex + 1}</p>
          <p className="mt-2 text-sm leading-relaxed">{data.snippet}</p>
        </>
      )}
    </>
  );
}

export function TraceabilityGraph({ graph }: TraceabilityGraphProps) {
  const [theme] = useState<GraphTheme>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth
  );
  const [isPresentationMode, setPresentationMode] = useState(false);
  const [filters, setFilters] = useState<PresentationFilters>(DEFAULT_FILTERS);
  const [collapseChunks, setCollapseChunks] = useState(graph.stats.stories > 100);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [statsFilter, setStatsFilter] = useState<StatFilterType | null>(null);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<TraceFlowNode, TraceFlowEdge> | null>(null);

  const isDesktop = viewportWidth > 1024;
  const isTablet = viewportWidth >= 768 && viewportWidth <= 1024;
  const canPresent = isDesktop;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const togglePresentation = useCallback(async () => {
    if (!canPresent) return;
    if (!isPresentationMode) {
      if (typeof document !== "undefined" && document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Fallback overlay mode handled by fixed container below.
        }
      }
      setPresentationMode(true);
      return;
    }
    if (typeof document !== "undefined" && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore exit errors and continue.
      }
    }
    setPresentationMode(false);
  }, [canPresent, isPresentationMode]);

  const filteredGraph = useMemo(() => {
    const maybeCollapsed = collapseChunks
      ? collapseChunkNodes(graph.nodes, graph.edges)
      : { nodes: graph.nodes, edges: graph.edges };
    return applyPresentationFilters(maybeCollapsed.nodes, maybeCollapsed.edges, filters);
  }, [collapseChunks, filters, graph.edges, graph.nodes]);

  const layoutKey = useMemo(
    () =>
      `${filteredGraph.nodes.length}:${filteredGraph.edges.length}:${filteredGraph.nodes
        .map((node) => node.id)
        .join("|")}:${filteredGraph.edges.map((edge) => edge.id).join("|")}`,
    [filteredGraph.edges, filteredGraph.nodes]
  );

  const layouted = useMemo(
    () => layoutGraph(filteredGraph.nodes, filteredGraph.edges, theme),
    [theme, filteredGraph.nodes, filteredGraph.edges]
  );

  const activeHighlight = useMemo(() => {
    const selected = selectedNodeId;
    if (selected) {
      return collectConnectedWithinTwoHops(selected, layouted.edges);
    }
    if (hoveredNodeId) {
      return collectConnectedWithinTwoHops(hoveredNodeId, layouted.edges);
    }
    if (statsFilter) {
      const nodeIds = new Set(
        layouted.nodes
          .map((layoutedNode) => layoutedNode.node)
          .filter((node) => toFilterType(node.kind) === statsFilter)
          .map((node) => node.id)
      );
      const edgeIds = new Set<string>();
      for (const edge of layouted.edges) {
        if (!nodeIds.has(edge.source) && !nodeIds.has(edge.target)) continue;
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
      return { nodeIds, edgeIds };
    }
    return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
  }, [hoveredNodeId, layouted.edges, layouted.nodes, selectedNodeId, statsFilter]);

  const hasFocusedHighlights = activeHighlight.nodeIds.size > 0 || activeHighlight.edgeIds.size > 0;

  const selectNode = useCallback(
    (nodeId: string) => {
      if (nodeId.startsWith("chunk-summary:")) {
        setCollapseChunks(false);
      }
      setStatsFilter(null);
      setSelectedNodeId(nodeId);
      const layoutedNode = layouted.nodes.find((entry) => entry.node.id === nodeId);
      if (!flowInstance || !layoutedNode) return;
      flowInstance.setCenter(layoutedNode.x + layoutedNode.width / 2, layoutedNode.y + layoutedNode.height / 2, {
        zoom: Math.min(flowInstance.getZoom() + 0.08, 1),
        duration: 400,
      });
    },
    [flowInstance, layouted.nodes]
  );

  const flowNodes = useMemo<TraceFlowNode[]>(() => {
    return layouted.nodes.map((entry) => {
      const isHighlighted = !hasFocusedHighlights || activeHighlight.nodeIds.has(entry.node.id);
      const isDimmed = hasFocusedHighlights && !activeHighlight.nodeIds.has(entry.node.id);
      const isSelected = entry.node.id === selectedNodeId || (!selectedNodeId && entry.node.id === hoveredNodeId);
      const visual = {
        isHighlighted,
        isDimmed,
        isSelected,
        theme,
        presentationMode: isPresentationMode,
        miniMode: false,
        onSelect: selectNode,
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
        selectable: true,
      } as TraceFlowNode;
    });
  }, [
    activeHighlight.nodeIds,
    hasFocusedHighlights,
    hoveredNodeId,
    isPresentationMode,
    layouted.nodes,
    selectNode,
    selectedNodeId,
    theme,
  ]);

  const flowEdges = useMemo<TraceFlowEdge[]>(() => {
    return layouted.edges.map((edge) => {
      const isHighlighted = !hasFocusedHighlights || activeHighlight.edgeIds.has(edge.id);
      const isDimmed = hasFocusedHighlights && !activeHighlight.edgeIds.has(edge.id);
      const animate = isPresentationMode || ((selectedNodeId !== null || hoveredNodeId !== null) && isHighlighted);
      const showLabel = !!(selectedNodeId || hoveredNodeId) && isHighlighted;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "traced",
        data: {
          edgeType: edge.edgeType,
          confidence: edge.confidence,
          isHighlighted,
          isDimmed,
          animate,
          showLabel,
          label: edge.label,
          theme,
          presentationMode: isPresentationMode,
        } as Record<string, unknown>,
      } as TraceFlowEdge;
    });
  }, [
    activeHighlight.edgeIds,
    hasFocusedHighlights,
    hoveredNodeId,
    isPresentationMode,
    layouted.edges,
    selectedNodeId,
    theme,
  ]);

  useEffect(() => {
    if (!flowInstance || flowNodes.length === 0) return;
    flowInstance.fitView({
      padding: isPresentationMode ? 0.24 : 0.16,
      duration: 300,
      maxZoom: 1,
    });
  }, [flowInstance, flowNodes.length, flowEdges.length, isPresentationMode, layoutKey]);

  const onNodeMouseEnter = useCallback<NodeMouseHandler<TraceFlowNode>>(
    (_, node) => {
      setHoveredNodeId(node.id);
    },
    []
  );

  const onNodeMouseLeave = useCallback<NodeMouseHandler<TraceFlowNode>>(
    (_, node) => {
      setHoveredNodeId((current) => (current === node.id ? null : current));
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setStatsFilter(null);
    flowInstance?.fitView({ padding: isPresentationMode ? 0.24 : 0.16, duration: 320, maxZoom: 1 });
  }, [flowInstance, isPresentationMode]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return layouted.nodes.find((entry) => entry.node.id === selectedNodeId)?.node ?? null;
  }, [layouted.nodes, selectedNodeId]);

  const graphSurfaceStyle = isPresentationMode
    ? {
        backgroundColor: theme === "dark" ? "#0F172A" : "#FFFFFF",
      }
    : undefined;

  return (
    <div
      className={
        isPresentationMode
          ? "fixed inset-0 z-[70] flex flex-col"
          : "relative flex h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border"
      }
      style={graphSurfaceStyle}
      onKeyDown={(event) => {
        if (!flowInstance) return;
        const viewport = flowInstance.getViewport();
        const step = 60;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          flowInstance.setViewport({ ...viewport, x: viewport.x + step }, { duration: 120 });
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          flowInstance.setViewport({ ...viewport, x: viewport.x - step }, { duration: 120 });
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          flowInstance.setViewport({ ...viewport, y: viewport.y + step }, { duration: 120 });
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          flowInstance.setViewport({ ...viewport, y: viewport.y - step }, { duration: 120 });
        } else if (event.key === "Escape") {
          event.preventDefault();
          if (isPresentationMode) {
            void togglePresentation();
          } else {
            setSelectedNodeId(null);
            flowInstance.fitView({ padding: 0.16, duration: 260, maxZoom: 1 });
          }
        }
      }}
      tabIndex={0}
    >
      {!isPresentationMode && (
        <div className="flex items-center justify-between border-b bg-background px-4 py-2">
          <div>
            <h2 className="text-base font-semibold">Traceability graph</h2>
            {collapseChunks && graph.stats.stories > 100 && (
              <p className="text-xs text-muted-foreground">
                Chunk nodes are collapsed for performance. Click a chunk summary node to expand.
              </p>
            )}
          </div>
        </div>
      )}

      {!isPresentationMode && (
        <div className="absolute right-4 top-3 z-30">
          <PresentationMode
            packName={graph.packName}
            canPresent={canPresent}
            isPresentationMode={isPresentationMode}
            onTogglePresentation={() => {
              void togglePresentation();
            }}
            filters={filters}
            onFiltersChange={setFilters}
            onFiltersReset={() => setFilters(DEFAULT_FILTERS)}
            onZoomOut={() => flowInstance?.zoomOut({ duration: 120 })}
            onZoomIn={() => flowInstance?.zoomIn({ duration: 120 })}
            onFitView={() =>
              flowInstance?.fitView({
                padding: isPresentationMode ? 0.24 : 0.16,
                duration: 250,
                maxZoom: 1,
              })
            }
          />
        </div>
      )}

      {isPresentationMode && (
        <PresentationMode
          packName={graph.packName}
          canPresent={canPresent}
          isPresentationMode={isPresentationMode}
          onTogglePresentation={() => {
            void togglePresentation();
          }}
          showToggleButton={false}
          filters={filters}
          onFiltersChange={setFilters}
          onFiltersReset={() => setFilters(DEFAULT_FILTERS)}
          onZoomOut={() => flowInstance?.zoomOut({ duration: 120 })}
          onZoomIn={() => flowInstance?.zoomIn({ duration: 120 })}
          onFitView={() =>
            flowInstance?.fitView({
              padding: 0.24,
              duration: 250,
              maxZoom: 1,
            })
          }
        />
      )}

      {!isPresentationMode && (
        <GraphStats
          stats={graph.stats}
          activeFilter={statsFilter}
          onToggleFilter={(filter) =>
            setStatsFilter((current) => (current === filter ? null : filter))
          }
          onShowAll={() => setStatsFilter(null)}
          onFitView={() => flowInstance?.fitView({ padding: 0.16, duration: 250, maxZoom: 1 })}
          onTogglePresentation={() => {
            void togglePresentation();
          }}
          canPresent={canPresent}
        />
      )}

      <div className="relative flex-1">
        <ReactFlow<TraceFlowNode, TraceFlowEdge>
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
          onInit={setFlowInstance}
          onPaneClick={onPaneClick}
          onNodeClick={(_, node) => selectNode(node.id)}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          nodesDraggable={false}
          elementsSelectable
          nodesConnectable={false}
          minZoom={0.2}
          maxZoom={1.2}
          proOptions={{ hideAttribution: true }}
        >
          {!isPresentationMode && (
            <>
              <MiniMap
                pannable
                zoomable
                className="!bg-background/90"
                nodeColor={(node) => {
                  if (node.type === "source") return "#3B82F6";
                  if (node.type === "story") return "#8B5CF6";
                  if (node.type === "ac") return "#22C55E";
                  if (node.type === "evidence") return "#F59E0B";
                  return "#9CA3AF";
                }}
              />
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
            </>
          )}
        </ReactFlow>

        {selectedNode && !isPresentationMode && (
          <aside
            className={
              isTablet
                ? "absolute inset-y-0 right-0 z-20 w-[320px] border-l bg-background/95 p-4 shadow-xl backdrop-blur"
                : "absolute inset-y-0 right-0 z-20 w-[320px] border-l bg-background/95 p-4 backdrop-blur"
            }
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Details</p>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Close
              </button>
            </div>
            {getNodePanelContent(selectedNode)}
          </aside>
        )}
      </div>
    </div>
  );
}
