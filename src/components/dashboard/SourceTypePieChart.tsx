"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface SourceTypeCount {
  type: string;
  count: number;
}

interface SourceTypePieChartProps {
  data: SourceTypeCount[];
}

const COLOURS = [
  "#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

function formatType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SourceTypePieChart({ data }: SourceTypePieChartProps) {
  const chartData = data
    .filter((d) => d.count > 0)
    .map((d, i) => ({
      name: formatType(d.type),
      value: d.count,
      colour: COLOURS[i % COLOURS.length],
    }));

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-card">
        <h3 className="font-semibold mb-3">Sources by type</h3>
        <p className="text-sm text-muted-foreground">No sources yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 bg-card">
      <h3 className="font-semibold mb-3">Sources by type</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) =>
                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.colour} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number | undefined) =>
                [`${value ?? 0} sources`, "Count"]
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
