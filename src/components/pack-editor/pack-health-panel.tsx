"use client";

import { trpc } from "@/lib/trpc";
import { PackHealthBadge } from "./pack-health-badge";

interface PackHealthPanelProps {
  packId: string;
}

const FACTOR_LABELS: Record<string, string> = {
  sourceDrift: "Source alignment",
  evidenceCoverage: "Evidence coverage",
  qaPassRate: "QA pass rate",
  deliveryFeedback: "Delivery feedback",
  sourceAge: "Source freshness",
};

export function PackHealthPanel({ packId }: PackHealthPanelProps) {
  const { data, isLoading, refetch } = trpc.pack.getHealth.useQuery({ packId });
  const refreshHealth = trpc.pack.refreshHealth.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading health...</p>
      </div>
    );
  }

  const { score, status, factors, computedAt, trend } = data;

  return (
    <div className="rounded-lg border p-4 bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pack Health</h3>
        <div className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold ${
              status === "healthy"
                ? "text-green-600"
                : status === "stale"
                  ? "text-amber-600"
                  : status === "at_risk"
                    ? "text-orange-600"
                    : "text-red-600"
            }`}
          >
            {score}
          </span>
          <PackHealthBadge score={score} status={status} />
          {trend && (
            <span className="text-sm text-muted-foreground">
              {trend === "improving" && "↑ improving"}
              {trend === "stable" && "→ stable"}
              {trend === "declining" && "↓ declining"}
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground capitalize">{status}</p>

      <div className="space-y-2">
        {Object.entries(factors).map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{FACTOR_LABELS[key] ?? key}</span>
              <span>{value}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  value >= 80
                    ? "bg-green-500"
                    : value >= 60
                      ? "bg-amber-500"
                      : value >= 40
                        ? "bg-orange-500"
                        : "bg-red-500"
                }`}
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
        <span>
          Last checked:{" "}
          {computedAt
            ? new Date(computedAt).toLocaleString()
            : "Never"}
        </span>
        <button
          onClick={() => refreshHealth.mutate({ packId })}
          disabled={refreshHealth.isPending}
          className="px-3 py-1 border rounded hover:bg-muted disabled:opacity-50"
        >
          {refreshHealth.isPending ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}
