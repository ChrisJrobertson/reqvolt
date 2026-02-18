"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

interface QualityReport {
  confidenceScore: number;
  confidenceLevel: "high" | "moderate" | "low";
  selfReview?: {
    issueCount: number;
    issues: Array<{ description: string; storyIndex?: number }>;
    missedRequirements: Array<{ topic: string; suggestion: string }>;
  };
  evidenceCoverage?: { percentage: number; status: string };
  qaPassRate?: { percentage: number };
}

export function GenerationConfidenceBar({
  report,
  isLatestVersion,
}: {
  report: QualityReport | null;
  packVersionId?: string;
  isLatestVersion: boolean;
}) {
  const [expanded, setExpanded] = useState(report?.confidenceLevel !== "high");
  const [showFullReport, setShowFullReport] = useState(false);

  if (!report || !isLatestVersion) return null;

  const barColor =
    report.confidenceLevel === "high"
      ? "bg-green-500"
      : report.confidenceLevel === "moderate"
        ? "bg-amber-500"
        : "bg-red-500";

  const labelColor =
    report.confidenceLevel === "high"
      ? "text-green-600"
      : report.confidenceLevel === "moderate"
        ? "text-amber-600"
        : "text-red-600";

  const hasIssues =
    (report.selfReview?.issueCount ?? 0) > 0 ||
    (report.selfReview?.missedRequirements?.length ?? 0) > 0;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Generation Confidence:</span>
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor}`}
              style={{ width: `${report.confidenceScore}%` }}
            />
          </div>
          <span className={`text-sm font-medium ${labelColor}`}>
            {report.confidenceScore}% {report.confidenceLevel.charAt(0).toUpperCase() + report.confidenceLevel.slice(1)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="text-sm text-muted-foreground flex gap-4">
            {report.evidenceCoverage && (
              <span>Evidence: {Math.round(report.evidenceCoverage.percentage)}% {report.evidenceCoverage.status}</span>
            )}
            {report.qaPassRate && (
              <span>QA: {Math.round(report.qaPassRate.percentage)}%</span>
            )}
            {report.selfReview && (
              <span>Review: {report.selfReview.issueCount === 0 ? "acceptable" : "issues found"}</span>
            )}
          </div>

          {hasIssues && (
            <div className="space-y-1 text-sm">
              {report.selfReview?.issues?.slice(0, 2).map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{issue.description}</span>
                </div>
              ))}
              {report.selfReview?.missedRequirements?.slice(0, 1).map((mr, i) => (
                <div key={i} className="flex items-start gap-2 text-amber-600">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>1 requirement topic not covered ({mr.topic})</span>
                  <button
                    type="button"
                    onClick={() => setShowFullReport(true)}
                    className="text-primary hover:underline ml-1"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFullReport(true)}
            className="text-sm text-primary hover:underline"
          >
            View full quality report
          </button>
        </>
      )}

      {showFullReport && (
        <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm space-y-2 max-h-64 overflow-y-auto">
          <h4 className="font-medium">Full Quality Report</h4>
          {report.selfReview?.issues?.map((issue, i) => (
            <p key={i}>
              <span className="text-amber-600">Issue:</span> {issue.description}
              {issue.storyIndex != null && ` (Story ${issue.storyIndex + 1})`}
            </p>
          ))}
          {report.selfReview?.missedRequirements?.map((mr, i) => (
            <p key={i}>
              <span className="text-amber-600">Missed:</span> {mr.topic} — {mr.suggestion}
            </p>
          ))}
          <button
            type="button"
            onClick={() => setShowFullReport(false)}
            className="text-primary hover:underline"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
