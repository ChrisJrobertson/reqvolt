"use client";

import type { TraceabilityGraphStats } from "@/lib/traceability/graph-types";
import { BookOpen, CheckCheck, FileText, Link2, Maximize2 } from "lucide-react";

type StatFilterType = "source" | "story" | "ac" | "evidence" | "chunk";

interface GraphStatsProps {
  stats: TraceabilityGraphStats;
  activeFilter: StatFilterType | null;
  onToggleFilter: (filter: StatFilterType) => void;
  onShowAll: () => void;
  onFitView: () => void;
  onTogglePresentation: () => void;
  canPresent: boolean;
}

function getCoverageColour(coverage: number): string {
  if (coverage > 80) return "text-green-600";
  if (coverage >= 60) return "text-amber-600";
  return "text-red-600";
}

export function GraphStats({
  stats,
  activeFilter,
  onToggleFilter,
  onShowAll,
  onFitView,
  onTogglePresentation,
  canPresent,
}: GraphStatsProps) {
  const coverageColour = getCoverageColour(stats.coverage);
  const statClass = (type: StatFilterType) =>
    `inline-flex items-center gap-1 rounded px-2 py-1 transition-colors ${
      activeFilter === type ? "bg-primary/10 text-primary" : "hover:bg-muted"
    }`;

  return (
    <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button className={statClass("source")} onClick={() => onToggleFilter("source")}>
          <FileText size={14} />
          <span className="font-mono">{stats.sources}</span> Sources
        </button>
        <span className="text-muted-foreground">·</span>
        <button className={statClass("story")} onClick={() => onToggleFilter("story")}>
          <BookOpen size={14} />
          <span className="font-mono">{stats.stories}</span> Stories
        </button>
        <span className="text-muted-foreground">·</span>
        <button className={statClass("ac")} onClick={() => onToggleFilter("ac")}>
          <CheckCheck size={14} />
          <span className="font-mono">{stats.acceptanceCriteria}</span> ACs
        </button>
        <span className="text-muted-foreground">·</span>
        <button className={statClass("evidence")} onClick={() => onToggleFilter("evidence")}>
          <Link2 size={14} />
          <span className="font-mono">{stats.evidenceLinks}</span> Evidence Links
        </button>
        <span className="text-muted-foreground">·</span>
        <span className={`font-medium ${coverageColour}`}>Coverage: {stats.coverage}%</span>
        {activeFilter && (
          <button onClick={onShowAll} className="ml-2 text-xs text-muted-foreground hover:underline">
            Show all
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onFitView} className="rounded border px-3 py-1 text-xs hover:bg-muted">
          Fit View
        </button>
        {canPresent && (
          <button
            onClick={onTogglePresentation}
            className="inline-flex items-center gap-1 rounded border px-3 py-1 text-xs hover:bg-muted"
          >
            <Maximize2 size={12} />
            Presentation Mode
          </button>
        )}
      </div>
    </div>
  );
}
