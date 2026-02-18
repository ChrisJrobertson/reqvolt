"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: number | null;
  subtitle?: string;
}

export function StatCard({ title, value, trend, subtitle }: StatCardProps) {
  return (
    <div className="rounded-lg border p-4 bg-card">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {trend !== undefined && trend !== null && (
        <div className="mt-1 flex items-center gap-1 text-sm">
          {trend > 0 ? (
            <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              +{trend} vs last month
            </span>
          ) : trend < 0 ? (
            <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
              <TrendingDown className="h-4 w-4" />
              {trend} vs last month
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Minus className="h-4 w-4" />
              No change
            </span>
          )}
        </div>
      )}
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
