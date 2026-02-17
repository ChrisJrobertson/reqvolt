"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { TraceabilityGraph } from "../TraceabilityGraph";
import { TraceabilityMini } from "../TraceabilityMini";

interface TraceabilityPageClientProps {
  workspaceId: string;
  projectId: string;
  packId: string;
  packName: string;
}

export function TraceabilityPageClient({
  workspaceId,
  projectId,
  packId,
  packName,
}: TraceabilityPageClientProps) {
  const { data, isLoading, error } = trpc.pack.getTraceabilityGraph.useQuery(
    { packId },
    { staleTime: 60_000 }
  );
  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth < 768;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/workspace/${workspaceId}/projects/${projectId}/packs/${packId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to pack
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Traceability · {packName}</h1>
          <p className="text-sm text-muted-foreground">
            Explore Sources → Stories → Acceptance Criteria → Evidence → Chunks.
          </p>
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3">
          <TraceabilityMini
            workspaceId={workspaceId}
            projectId={projectId}
            packId={packId}
            graph={data}
          />
          <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            View on desktop for the full interactive traceability graph.
          </p>
        </div>
      ) : isLoading ? (
        <div className="rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">
          Loading traceability graph…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Unable to load traceability graph: {error.message}
        </div>
      ) : data ? (
        <TraceabilityGraph graph={data} />
      ) : (
        <div className="rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">
          No traceability data available for this pack yet.
        </div>
      )}
    </div>
  );
}
