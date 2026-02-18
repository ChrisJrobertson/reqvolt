"use client";

import { useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Handle,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  type Node,
  type NodeTypes,
  type NodeProps,
  type Edge,
  Panel,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  MessageSquare,
  CheckSquare,
  Diamond,
  FileCode,
} from "lucide-react";

const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;

function getLayoutedElements(
  nodes: Array<{ id: string; type: string; label: string; data: Record<string, unknown> }>,
  edges: Array<{ id: string; source: string; target: string }>,
  direction = "LR"
) {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 60 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const isHorizontal = direction === "LR";
  const layoutedNodes: Node[] = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: node.type,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { ...node.data, label: node.label },
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
    };
  });

  const layoutedEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.id.includes("supported_by"),
    style: e.id.includes("informs")
      ? { strokeDasharray: "5 5", stroke: "#94a3b8" }
      : e.id.includes("references")
        ? { strokeDasharray: "2 2", stroke: "#94a3b8" }
        : undefined,
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

function SourceNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/50 dark:border-blue-600 min-w-[140px] max-w-[200px] relative">
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-sm font-medium truncate">{String(data.label ?? "")}</span>
      </div>
    </div>
  );
}

function StoryNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded-lg border-2 border-purple-500 bg-purple-50 dark:bg-purple-950/50 dark:border-purple-600 min-w-[140px] max-w-[200px] relative">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
        <span className="text-sm font-medium truncate">{String(data.label ?? "")}</span>
      </div>
    </div>
  );
}

function AcNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-1.5 rounded-full border-2 border-green-500 bg-green-50 dark:bg-green-950/50 dark:border-green-600 min-w-[80px] relative">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <CheckSquare className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-xs font-medium">{String(data.label ?? "")}</span>
      </div>
    </div>
  );
}

function EvidenceNode({ data }: NodeProps) {
  const conf = String(data.confidence ?? "medium");
  const colors =
    conf === "high"
      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-600"
      : conf === "low"
        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/50 dark:border-amber-600"
        : "border-orange-500 bg-orange-50 dark:bg-orange-950/50 dark:border-orange-600";
  return (
    <div
      className={`px-2 py-1 rounded border-2 ${colors} w-12 h-12 flex items-center justify-center rotate-45 relative`}
    >
      <Handle type="target" position={Position.Left} className="!left-0 !-translate-y-1/2 !translate-x-0" />
      <Handle type="source" position={Position.Right} className="!right-0 !-translate-y-1/2 !translate-x-0" />
      <Diamond className="h-4 w-4 -rotate-45" />
      <span className="sr-only">{conf}</span>
    </div>
  );
}

function ChunkNode({ data }: NodeProps) {
  return (
    <div className="px-3 py-2 rounded border-2 border-zinc-400 bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-600 min-w-[140px] max-w-[200px] relative">
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <FileCode className="h-4 w-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
        <span className="text-xs truncate">{String(data.label ?? "")}</span>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  source: SourceNode,
  story: StoryNode,
  ac: AcNode,
  evidence: EvidenceNode,
  chunk: ChunkNode,
};

export function TraceabilityGraph({
  packId,
  workspaceId,
  projectId,
}: {
  packId: string;
  workspaceId: string;
  projectId: string;
  projectName?: string;
  packName?: string;
}) {
  const { data, isLoading } = trpc.pack.getTraceabilityGraph.useQuery(
    { packId },
    { enabled: !!packId }
  );

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    if (!data?.nodes?.length) return { nodes: [], edges: [] };
    return getLayoutedElements(data.nodes, data.edges, "LR");
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const d = node.data as Record<string, unknown>;
      if (node.type === "source" && d.sourceId) {
        window.open(
          `/workspace/${workspaceId}/projects/${projectId}?source=${d.sourceId}`,
          "_blank"
        );
      }
      if (node.type === "story" && d.storyId) {
        const el = document.querySelector(`[data-story-id="${d.storyId}"]`);
        el?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [workspaceId, projectId]
  );

  if (isLoading) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">Loading traceability graph…</p>
      </div>
    );
  }

  if (!data || data.nodeCount === 0) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-muted/30 rounded-lg">
        <p className="text-muted-foreground">
          No traceability data yet. Generate a pack with evidence links.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] rounded-lg border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          setNodes((nds) => nds);
        }}
        onEdgesChange={(changes) => {
          onEdgesChange(changes);
          setEdges((eds) => eds);
        }}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "source") return "#3b82f6";
            if (n.type === "story") return "#a855f7";
            if (n.type === "ac") return "#22c55e";
            if (n.type === "evidence") return "#f97316";
            return "#71717a";
          }}
        />
        <Panel position="top-left" className="bg-background/90 px-2 py-1 rounded text-sm">
          {data.nodeCount} nodes · {data.edgeCount} edges · {data.evidenceCoveragePct}% evidence
          coverage
        </Panel>
      </ReactFlow>
    </div>
  );
}
