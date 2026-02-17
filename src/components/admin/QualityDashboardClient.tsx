"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function QualityDashboardClient() {
  const [period, setPeriod] = useState<"30d" | "90d" | "all">("30d");
  const overview = trpc.adminQuality.overview.useQuery({ period });
  const feedback = trpc.adminQuality.feedbackSummary.useQuery({ period });
  const edits = trpc.adminQuality.editAnalytics.useQuery({ period });
  const modelUsage = trpc.adminQuality.modelUsage.useQuery({ period });
  const bySourceType = trpc.adminQuality.qualityBySourceType.useQuery({ period });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Period</label>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as "30d" | "90d" | "all")}
          className="rounded-md border px-2 py-1 text-sm"
        >
          <option value="30d">30d</option>
          <option value="90d">90d</option>
          <option value="all">All</option>
        </select>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Generation quality overview</h2>
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-muted-foreground">Total packs</p>
            <p className="text-xl font-semibold">{overview.data?.totalPacksGenerated ?? "—"}</p>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-muted-foreground">Average confidence</p>
            <p className="text-xl font-semibold">{overview.data?.averageConfidenceScore ?? 0}%</p>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-muted-foreground">Self-review pass rate</p>
            <p className="text-xl font-semibold">{overview.data?.selfReviewPassRate ?? 0}%</p>
          </div>
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-muted-foreground">Distribution</p>
            <p className="text-xs">
              High {overview.data?.confidenceDistribution.high ?? 0} · Moderate{" "}
              {overview.data?.confidenceDistribution.moderate ?? 0} · Low{" "}
              {overview.data?.confidenceDistribution.low ?? 0}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">User feedback summary</h2>
        <p className="text-sm">
          Story positive ratio:{" "}
          <span className="font-semibold">
            {feedback.data?.storyFeedback.positiveRatio ?? 0}%
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pack ratings — Positive {feedback.data?.packFeedback.positive ?? 0}, Neutral{" "}
          {feedback.data?.packFeedback.neutral ?? 0}, Negative{" "}
          {feedback.data?.packFeedback.negative ?? 0}
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Edit analytics</h2>
        <p className="text-sm">
          Average unchanged rate:{" "}
          <span className="font-semibold">{edits.data?.averageUnchangedRate ?? 0}%</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Stories deleted per pack: {edits.data?.storiesDeletedPerPack ?? 0} · Stories added per
          pack: {edits.data?.storiesAddedPerPack ?? 0}
        </p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Model usage & cost</h2>
        <p className="text-sm">
          Estimated cost:{" "}
          <span className="font-semibold">${modelUsage.data?.estimatedCostTotal ?? 0}</span>
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {Object.entries(modelUsage.data?.byModel ?? {}).map(([model, values]) => (
            <div key={model} className="rounded-md border p-2 text-xs">
              <p className="font-medium">{model}</p>
              <p className="text-muted-foreground">
                Input {values.inputTokens} · Output {values.outputTokens} · Cost $
                {values.estimatedCost.toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Quality by source type</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-2">Source type</th>
                <th className="py-2 pr-2">Avg confidence</th>
                <th className="py-2 pr-2">Pack count</th>
              </tr>
            </thead>
            <tbody>
              {(bySourceType.data ?? []).map((row) => (
                <tr key={row.sourceType} className="border-b">
                  <td className="py-2 pr-2">{row.sourceType}</td>
                  <td className="py-2 pr-2">{row.avgConfidence}%</td>
                  <td className="py-2 pr-2">{row.packCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
