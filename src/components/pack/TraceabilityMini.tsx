"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { GitBranch } from "lucide-react";

export function TraceabilityMini({
  packId,
  workspaceId,
  projectId,
}: {
  packId: string;
  workspaceId: string;
  projectId: string;
}) {
  const { data } = trpc.pack.getTraceabilityGraph.useQuery(
    { packId },
    { enabled: !!packId }
  );

  const href = `/workspace/${workspaceId}/projects/${projectId}/packs/${packId}/traceability`;

  if (!data) {
    return (
      <Link
        href={href}
        className="block w-full max-w-[300px] h-[200px] rounded-lg border bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors"
      >
        <div className="text-center">
          <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground">View Traceability</span>
        </div>
      </Link>
    );
  }

  if (data.nodeCount === 0) {
    return (
      <Link
        href={href}
        className="block w-full max-w-[300px] h-[200px] rounded-lg border bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors"
      >
        <div className="text-center p-4">
          <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground block">
            No traceability data yet
          </span>
          <span className="text-xs text-muted-foreground">Generate pack with evidence</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="block w-full max-w-[300px] h-[200px] rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden"
    >
      <div className="p-3 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Traceability</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1 flex-1">
          <p>{data.nodeCount} nodes · {data.edgeCount} edges</p>
          <p>{data.evidenceCoveragePct}% evidence coverage</p>
        </div>
        <span className="text-xs text-primary font-medium">View full graph →</span>
      </div>
    </Link>
  );
}
