"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Period = "30d" | "90d" | "all";

export function AdminQualityDashboard() {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: overview, isLoading: overviewLoading } = trpc.adminQuality.overview.useQuery({
    period,
  });
  const { data: feedback, isLoading: feedbackLoading } = trpc.adminQuality.feedbackSummary.useQuery({
    period,
  });
  const { data: editAnalytics, isLoading: editLoading } = trpc.adminQuality.editAnalytics.useQuery({
    period,
  });
  const { data: modelUsage, isLoading: usageLoading } = trpc.adminQuality.modelUsage.useQuery({
    period,
  });
  const { data: bySourceType } = trpc.adminQuality.qualityBySourceType.useQuery({
    period,
  });

  const loading = overviewLoading || feedbackLoading || editLoading || usageLoading;

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        {(["30d", "90d", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded text-sm ${
              period === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
            }`}
          >
            {p === "30d" ? "30 days" : p === "90d" ? "90 days" : "All time"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Generation Quality Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total packs generated</p>
                <p className="text-2xl font-bold">{overview?.totalPacksGenerated ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average confidence score</p>
                <p className="text-2xl font-bold">{overview?.averageConfidenceScore ?? 0}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confidence distribution</p>
                <p className="text-sm">
                  High: {overview?.confidenceDistribution.high ?? 0} · Moderate:{" "}
                  {overview?.confidenceDistribution.moderate ?? 0} · Low:{" "}
                  {overview?.confidenceDistribution.low ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Self-review pass rate</p>
                <p className="text-2xl font-bold">{Math.round(overview?.selfReviewPassRate ?? 0)}%</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">User Feedback Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Story thumbs up/down ratio</p>
                <p className="text-2xl font-bold">{feedback?.storyFeedback.positivePct ?? 0}% positive</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pack feedback</p>
                <p className="text-sm">
                  ✓ {feedback?.packFeedback.positive ?? 0} · ~ {feedback?.packFeedback.neutral ?? 0} · ✗{" "}
                  {feedback?.packFeedback.negative ?? 0}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Edit Analytics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Packs analysed</p>
                <p className="text-2xl font-bold">{editAnalytics?.packsAnalysed ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average unchanged rate</p>
                <p className="text-2xl font-bold">{editAnalytics?.averageUnchangedRate ?? 0}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stories deleted per pack (avg)</p>
                <p className="text-2xl font-bold">{editAnalytics?.averageStoriesDeleted ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Stories added per pack (avg)</p>
                <p className="text-2xl font-bold">{editAnalytics?.averageStoriesAdded ?? 0}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Model Usage & Costs</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total tokens</p>
                <p className="text-2xl font-bold">
                  {modelUsage?.totalTokens != null
                    ? (modelUsage.totalTokens / 1000).toFixed(1) + "k"
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">By model</p>
                <p className="text-sm font-mono">
                  {modelUsage?.byModel
                    ? Object.entries(modelUsage.byModel)
                        .map(([m, t]) => `${m.split("-").slice(0, 2).join("-")}: ${(t / 1000).toFixed(0)}k`)
                        .join(" · ")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">By task</p>
                <p className="text-sm">
                  {modelUsage?.byTask
                    ? Object.entries(modelUsage.byTask)
                        .slice(0, 3)
                        .map(([t, n]) => `${t}: ${(n / 1000).toFixed(0)}k`)
                        .join(" · ")
                    : "—"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Quality by Source Type</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Source type</th>
                    <th className="text-right p-2">Pack count</th>
                    <th className="text-right p-2">Avg confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {bySourceType?.map((row) => (
                    <tr key={row.sourceType} className="border-b">
                      <td className="p-2">{row.sourceType}</td>
                      <td className="p-2 text-right">{row.packCount}</td>
                      <td className="p-2 text-right">{row.avgConfidence}%</td>
                    </tr>
                  ))}
                  {(!bySourceType || bySourceType.length === 0) && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-muted-foreground">
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
