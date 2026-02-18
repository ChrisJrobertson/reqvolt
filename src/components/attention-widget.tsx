"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PackHealthBadge } from "./pack-editor/pack-health-badge";

interface AttentionWidgetProps {
  workspaceId: string;
  projectId?: string;
}

export function AttentionWidget({ workspaceId, projectId }: AttentionWidgetProps) {
  const { data: packs } = trpc.pack.listNeedingAttention.useQuery(
    { projectId, limit: 5 },
    { enabled: !!workspaceId }
  );

  if (!packs) return null;

  if (packs.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950/20">
        <h3 className="font-semibold mb-1">Packs needing attention</h3>
        <p className="text-sm text-muted-foreground">All packs are healthy ✓</p>
      </div>
    );
  }

  const basePath = `/workspace/${workspaceId}/projects`;
  const maxRows = 5;

  return (
    <div className="rounded-lg border p-4 bg-card">
      <h3 className="font-semibold mb-3">Packs needing attention</h3>
      <ul className="space-y-2">
        {packs.slice(0, maxRows).map((pack) => (
          <li key={pack.id}>
            <Link
              href={`${basePath}/${pack.projectId}/packs/${pack.id}`}
              className="flex items-center justify-between gap-3 p-2 rounded hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium truncate block">{pack.name}</span>
                <span className="text-sm text-muted-foreground">
                  {pack.project.name}
                </span>
              </div>
              {pack.healthScore != null && pack.healthStatus && (
                <PackHealthBadge
                  score={pack.healthScore}
                  status={
                    pack.healthStatus as
                      | "healthy"
                      | "stale"
                      | "at_risk"
                      | "outdated"
                  }
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
      {packs.length > maxRows && (
        <Link
          href={projectId ? `${basePath}/${projectId}` : basePath}
          className="block mt-2 text-sm text-muted-foreground hover:underline"
        >
          View all
        </Link>
      )}
    </div>
  );
}
