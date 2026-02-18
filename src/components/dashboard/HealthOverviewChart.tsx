"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface PackHealth {
  id: string;
  name: string;
  projectName: string;
  projectId: string;
  healthScore: number;
  healthStatus: string;
}

interface HealthOverviewChartProps {
  packs: PackHealth[];
}

const HEALTH_COLOURS: Record<string, string> = {
  healthy: "#22c55e",
  stale: "#eab308",
  at_risk: "#f97316",
  outdated: "#ef4444",
};

export function HealthOverviewChart({ packs }: HealthOverviewChartProps) {
  const data = packs.map((p) => ({
    ...p,
    displayName: p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name,
  }));

  if (packs.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-card">
        <h3 className="font-semibold mb-3">Pack health overview</h3>
        <p className="text-sm text-muted-foreground">No packs yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 bg-card">
      <h3 className="font-semibold mb-3">Pack health overview</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis type="number" domain={[0, 100]} className="text-xs" />
            <YAxis
              type="category"
              dataKey="displayName"
              width={75}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as PackHealth;
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-lg">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.projectName}</p>
                    <p className="text-sm">
                      Score: {p.healthScore} · {p.healthStatus}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="healthScore" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={HEALTH_COLOURS[entry.healthStatus] ?? "#94a3b8"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Healthy
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Stale
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500" /> At risk
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Outdated
        </span>
      </div>
    </div>
  );
}
