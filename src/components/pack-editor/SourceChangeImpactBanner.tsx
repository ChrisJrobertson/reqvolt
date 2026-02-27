"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ChangeImpactReport } from "@/components/change-request/ChangeImpactReport";

interface SourceChangeImpactBannerProps {
  packId: string;
  workspaceId: string;
  projectId: string;
  sourceIds: string[];
  onRefresh?: () => void;
}

export function SourceChangeImpactBanner({
  packId,
  workspaceId,
  projectId,
  sourceIds,
  onRefresh,
}: SourceChangeImpactBannerProps) {
  const router = useRouter();
  const [showPanel, setShowPanel] = useState(false);

  const { data, isLoading, refetch } = trpc.sourceImpact.list.useQuery({
    packId,
    acknowledged: false,
    limit: 50,
  });

  const acknowledgeAll = trpc.sourceImpact.acknowledgeAll.useMutation({
    onSuccess: () => refetch(),
  });

  const createCR = trpc.changeRequest.create.useMutation();

  const regenerate = trpc.pack.regenerate.useMutation({
    onSuccess: () => {
      onRefresh?.();
      window.location.reload();
    },
  });

  if (isLoading || !data || data.total === 0) return null;

  const { impacts, total } = data;
  const storyCount = impacts.reduce((sum, i) => sum + i.affectedStoryCount, 0);

  const severityBadgeClass = (s: string) => {
    switch (s) {
      case "minor":
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
      case "moderate":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "major":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
      <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100">
              ⚠️ {total} source{total !== 1 ? "s have" : " has"} changed since
              this pack was generated.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              {storyCount} stor{storyCount !== 1 ? "ies" : "y"} may be affected.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPanel(true)}
              className="px-3 py-1.5 border border-amber-600 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 text-sm font-medium"
            >
              View Impact Report
            </button>
            <button
              onClick={() => {
                if (sourceIds.length > 0) {
                  regenerate.mutate({
                    packId,
                    sourceIds,
                  });
                }
              }}
              disabled={regenerate.isPending || sourceIds.length === 0}
              className="px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
            >
              {regenerate.isPending ? "Refreshing..." : "Refresh Pack"}
            </button>
            <button
              onClick={() => acknowledgeAll.mutate({ packId })}
              disabled={acknowledgeAll.isPending}
              className="px-3 py-1.5 border rounded hover:bg-muted text-sm"
            >
              {acknowledgeAll.isPending ? "Dismissing..." : "Dismiss All"}
            </button>
          </div>
        </div>
      </div>

      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowPanel(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-md h-full bg-background border-l shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                Source change impacts
              </h2>
              <button
                onClick={() => setShowPanel(false)}
                className="p-2 rounded hover:bg-muted"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <ChangeImpactReport
                packId={packId}
                workspaceId={workspaceId}
                projectId={projectId}
                onCreateChangeRequest={(prefill) => {
                  createCR.mutate(
                    {
                      projectId,
                      packId,
                      ...prefill,
                    },
                    {
                      onSuccess: () => {
                        setShowPanel(false);
                        router.push(
                          `/workspace/${workspaceId}/projects/${projectId}/change-requests`
                        );
                      },
                    }
                  );
                }}
              />
              {impacts.map((impact) => (
                <div
                  key={impact.id}
                  className="rounded-lg border p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {impact.source?.name ?? "Unknown source"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${severityBadgeClass(
                        impact.severity
                      )}`}
                    >
                      {impact.severity}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {impact.affectedStoryCount} stor
                    {impact.affectedStoryCount !== 1 ? "ies" : "y"} affected
                  </p>
                  {impact.impactSummary && (
                    <p className="text-sm">{impact.impactSummary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
