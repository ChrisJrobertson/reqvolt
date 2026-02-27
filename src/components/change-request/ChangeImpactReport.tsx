"use client";

import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";

interface ChangeImpactReportProps {
  packId: string;
  workspaceId: string;
  projectId: string;
  onCreateChangeRequest?: (prefill: {
    title: string;
    description: string;
    trigger: string;
    triggerSourceId?: string;
    impactedStoryIds: string[];
    impactSummary: string;
  }) => void;
}

export function ChangeImpactReport({
  packId,
  workspaceId: _workspaceId,
  projectId: _projectId,
  onCreateChangeRequest,
}: ChangeImpactReportProps) {
  void _workspaceId;
  void _projectId;
  const { data, isLoading } = trpc.sourceImpact.getImpactReport.useQuery(
    { packId },
    { enabled: !!packId }
  );

  if (isLoading || !data || data.impacts.length === 0) return null;

  const { sourcesChanged, storiesImpacted, stories, hasBaseline } = data;

  const handleCreateCR = () => {
    const firstImpact = data.impacts[0];
    const sourceName = firstImpact?.source?.name ?? "Unknown";
    onCreateChangeRequest?.({
      title: `Source update: ${sourceName}`,
      description:
        firstImpact?.impactSummary ??
        `${storiesImpacted} stor${storiesImpacted !== 1 ? "ies" : "y"} affected by source changes.`,
      trigger: `Source '${sourceName}' was updated`,
      triggerSourceId: firstImpact?.sourceId,
      impactedStoryIds: stories.map((s) => s.id),
      impactSummary:
        firstImpact?.impactSummary ??
        `${storiesImpacted} stor${storiesImpacted !== 1 ? "ies" : "y"} affected.`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Change Impact Report
        </h3>
        {hasBaseline && onCreateChangeRequest && (
          <button
            onClick={handleCreateCR}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:opacity-90"
          >
            Create Change Request
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {sourcesChanged} source{sourcesChanged !== 1 ? "s" : ""} changed,{" "}
        {storiesImpacted} stor{storiesImpacted !== 1 ? "ies" : "y"} impacted.
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {stories.map((story) => (
          <div
            key={story.id}
            className="rounded border p-3 text-sm space-y-1"
          >
            <p className="font-medium line-clamp-1">{story.want || "Story"}</p>
            {story.persona && (
              <p className="text-muted-foreground text-xs">As {story.persona}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {story.impacts.map((imp, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs"
                >
                  {imp.sourceName}
                </span>
              ))}
            </div>
            {hasBaseline && (
              <span className="text-xs text-amber-600">Requires re-approval</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
