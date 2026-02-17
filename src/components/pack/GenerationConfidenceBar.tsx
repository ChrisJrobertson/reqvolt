"use client";

import { useMemo, useState } from "react";
import type { QualityReport } from "@/lib/quality/types";

interface GenerationConfidenceBarProps {
  report: QualityReport | null;
  score: number | null;
  level: string | null;
}

function getBarClass(level: string | null): string {
  if (level === "high") return "bg-green-500";
  if (level === "moderate") return "bg-amber-500";
  return "bg-red-500";
}

function getLevelLabel(level: string | null): string {
  if (level === "high") return "High";
  if (level === "moderate") return "Moderate";
  return "Low";
}

export function GenerationConfidenceBar({
  report,
  score,
  level,
}: GenerationConfidenceBarProps) {
  const fallbackScore = score ?? 0;
  const fallbackLevel = level ?? "low";
  const [expanded, setExpanded] = useState(fallbackLevel !== "high");

  const warnings = useMemo(() => {
    if (!report) return [];
    const results: string[] = [];
    const hallucinationIssues = report.selfReview.issues.filter(
      (issue) => issue.issueType === "hallucination"
    );
    if (hallucinationIssues.length > 0) {
      results.push(
        `${hallucinationIssues.length} acceptance criteria may contain unsupported claims`
      );
    }
    if (report.coherence.offTopicStories.length > 0) {
      results.push(
        `${report.coherence.offTopicStories.length} requirement topic(s) may be off-topic`
      );
    }
    return results;
  }, [report]);

  return (
    <div className="rounded-lg border bg-background p-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold">
            Generation Confidence: {fallbackScore}% {getLevelLabel(fallbackLevel)}
          </p>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "View"}</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-muted">
          <div
            className={`h-2 rounded-full ${getBarClass(fallbackLevel)}`}
            style={{ width: `${Math.max(4, fallbackScore)}%` }}
          />
        </div>
      </button>

      {expanded && report && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted-foreground">
            Evidence: {report.evidenceCoverage.percentage}% {report.evidenceCoverage.status} · QA:{" "}
            {report.qaPassRate.percentage}% · Review: {report.selfReview.overallAssessment}
          </p>
          {warnings.length > 0 && (
            <div className="space-y-1">
              {warnings.map((warning) => (
                <p key={warning} className="text-amber-700">
                  ⚠ {warning}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
