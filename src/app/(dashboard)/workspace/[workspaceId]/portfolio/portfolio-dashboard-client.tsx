"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { subDays } from "date-fns";
import { AlertTriangle, Clock } from "lucide-react";

export function PortfolioDashboardClient({
  workspaceId,
}: {
  workspaceId: string;
  projects: { id: string; name: string }[];
}) {
  const [dateRangeDays, setDateRangeDays] = useState(90);
  const from = subDays(new Date(), dateRangeDays);
  const to = new Date();

  const { data: metrics, isLoading } = trpc.portfolio.metrics.useQuery({
    dateRange: { from, to },
  });
  const { data: breakdown } = trpc.portfolio.projectBreakdown.useQuery();

  if (isLoading || !metrics) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const coverageChartData = breakdown?.map((p) => ({
    name: p.projectName.slice(0, 15),
    evidence: p.evidenceCoverage,
    approval: 0,
  })) ?? [];

  const ambiguousTrendData = metrics.quality.ambiguousWordTrend;

  const totalConflicts = Object.values(metrics.riskSignals.unresolvedConflicts).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="space-y-8">
      {/* Date range filter */}
      <div className="flex gap-2">
        {[30, 60, 90].map((days) => (
          <button
            key={days}
            onClick={() => setDateRangeDays(days)}
            className={`px-4 py-2 rounded-lg text-sm ${
              dateRangeDays === days ? "bg-primary text-primary-foreground" : "border"
            }`}
          >
            Last {days} days
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4 bg-card">
          <p className="text-sm font-medium text-muted-foreground">Evidence coverage</p>
          <p className="mt-1 text-2xl font-bold">{metrics.coverage.averageEvidenceCoverage}%</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <p className="text-sm font-medium text-muted-foreground">Approval coverage</p>
          <p className="mt-1 text-2xl font-bold">{metrics.coverage.averageApprovalCoverage}%</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <p className="text-sm font-medium text-muted-foreground">QA pass rate</p>
          <p className="mt-1 text-2xl font-bold">{metrics.quality.qaPassRate}%</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <p className="text-sm font-medium text-muted-foreground">Unresolved conflicts</p>
          <p className="mt-1 text-2xl font-bold">{totalConflicts}</p>
        </div>
      </section>

      {/* Coverage section */}
      {coverageChartData.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold mb-4">Evidence coverage by project</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="evidence" fill="#0D8B8B" name="Evidence %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Cycle time */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Source → Generation</span>
          </div>
          <p className="mt-1 text-2xl font-bold">
            {metrics.cycleTime.avgSourceToGeneration ?? "—"} days
          </p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Generation → Baseline</span>
          </div>
          <p className="mt-1 text-2xl font-bold">
            {metrics.cycleTime.avgGenerationToBaseline ?? "—"} days
          </p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">Baseline → Push</span>
          </div>
          <p className="mt-1 text-2xl font-bold">
            {metrics.cycleTime.avgBaselineToPush ?? "—"} days
          </p>
        </div>
      </section>

      {/* Quality section */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ambiguousTrendData.length > 0 && (
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold mb-4">Vague term flags (last 6 months)</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ambiguousTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#0D8B8B" name="VAGUE_TERM" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-4">Top QA failures</h2>
          <ul className="space-y-2">
            {metrics.quality.commonQAFailures.map((f) => (
              <li key={f.ruleCode} className="flex justify-between text-sm">
                <span>{f.ruleCode}</span>
                <span className="font-medium">{f.count}</span>
              </li>
            ))}
            {metrics.quality.commonQAFailures.length === 0 && (
              <li className="text-muted-foreground text-sm">No QA failures</li>
            )}
          </ul>
        </div>
      </section>

      {/* Risk signals */}
      <section className="rounded-lg border p-4 border-amber-200 dark:border-amber-800">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Risk signals
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Unresolved conflicts</p>
            <p className="font-bold">{totalConflicts}</p>
            {totalConflicts > 0 && (
              <Link
                href={`/workspace/${workspaceId}`}
                className="text-sm text-primary hover:underline"
              >
                View evidence →
              </Link>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Low coverage packs (&lt;50%)</p>
            <p className="font-bold">{metrics.riskSignals.lowCoveragePacks.length}</p>
            {metrics.riskSignals.lowCoveragePacks.slice(0, 3).map((p) => (
              <Link
                key={p.packId}
                href={`/workspace/${workspaceId}/projects/${p.projectId}/packs/${p.packId}`}
                className="block text-sm text-primary hover:underline"
              >
                {p.packName} ({p.coverage}%)
              </Link>
            ))}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Orphaned stories</p>
            <p className="font-bold">{metrics.riskSignals.orphanedStories}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Stale sources (60+ days)</p>
            <p className="font-bold">{metrics.riskSignals.staleSources}</p>
          </div>
        </div>
      </section>

      {/* Churn hotspots */}
      {metrics.volatility.churnHotspots.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold mb-4">Churn hotspots (most edited packs)</h2>
          <div className="border rounded-lg divide-y">
            {metrics.volatility.churnHotspots.map((c) => (
              <div
                key={c.packId}
                className="flex justify-between items-center p-3"
              >
                <div>
                  <span className="font-medium">{c.packName}</span>
                  <span className="text-muted-foreground text-sm ml-2">
                    {c.projectName}
                  </span>
                </div>
                <span className="text-sm font-medium">{c.editCount} edits</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Project breakdown table */}
      {breakdown && breakdown.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold mb-4">Project breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Project</th>
                  <th className="text-left py-2">Packs</th>
                  <th className="text-left py-2">Evidence %</th>
                  <th className="text-left py-2">QA pass %</th>
                  <th className="text-left py-2">Last baseline</th>
                  <th className="text-left py-2">Last push</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((p) => (
                  <tr key={p.projectId} className="border-b">
                    <td className="py-2">
                      <Link
                        href={`/workspace/${workspaceId}/projects/${p.projectId}`}
                        className="text-primary hover:underline"
                      >
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="py-2">{p.packCount}</td>
                    <td className="py-2">{p.evidenceCoverage}%</td>
                    <td className="py-2">{p.qaPassRate}%</td>
                    <td className="py-2">
                      {p.lastBaselineDate?.toLocaleDateString() ?? "—"}
                    </td>
                    <td className="py-2">
                      {p.lastPushDate?.toLocaleDateString() ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
