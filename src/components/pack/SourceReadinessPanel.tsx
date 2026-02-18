"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Check, AlertTriangle, XCircle } from "lucide-react";

interface ReadinessCheck {
  name: string;
  status: "pass" | "warning" | "blocked";
  message: string | null;
  details?: unknown;
}

interface TopicCoverage {
  topic: string;
  depth: string;
  chunkCount?: number;
}

interface ReadinessReport {
  overallStatus: "ready" | "warnings" | "blocked";
  checks: ReadinessCheck[];
  topics: TopicCoverage[];
  estimatedStoryCount: number;
  estimatedGenerationTime: string;
}

export function SourceReadinessPanel({
  projectId,
  sourceIds,
  onTopicClick,
  onReport,
}: {
  projectId: string;
  sourceIds: string[];
  onTopicClick?: (topic: string) => void;
  onReport?: (report: ReadinessReport) => void;
}) {
  const { data: report, isLoading } = trpc.pack.assessReadiness.useQuery(
    { projectId, sourceIds },
    { enabled: sourceIds.length > 0 }
  );

  useEffect(() => {
    if (report && onReport) onReport(report);
  }, [report, onReport]);

  if (sourceIds.length === 0) return null;
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Analysing source readiness…
      </div>
    );
  }
  if (!report) return null;

  const statusIcon =
    report.overallStatus === "ready" ? (
      <span className="text-green-600" title="Ready">
        ●
      </span>
    ) : report.overallStatus === "warnings" ? (
      <span className="text-amber-500" title="Warnings">
        ●
      </span>
    ) : (
      <span className="text-red-500" title="Blocked">
        ●
      </span>
    );

  const checkIcon = (status: string) => {
    if (status === "pass") return <Check className="h-4 w-4 text-green-600" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const topicDepthIcon = (depth: string) => {
    if (depth === "detailed") return "●";
    if (depth === "moderate") return "◐";
    return "○";
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Source Readiness</h3>
        {statusIcon}
      </div>

      <div className="space-y-2 text-sm">
        {report.checks.map((check) => {
          const d = check.details as Record<string, unknown> | undefined;
          const detailText =
            d?.wordEstimate != null
              ? `${Number(d.wordEstimate).toLocaleString()} words`
              : d?.duplicatePct != null
                ? `${Math.round(Number(d.duplicatePct))}% duplicate content`
                : d?.chunksWithoutEmbedding === 0
                  ? "All chunks embedded"
                  : d?.chunksWithoutEmbedding
                    ? `${d.chunksWithoutEmbedding} still processing`
                    : Array.isArray(d?.types)
                      ? (d.types as string[]).join(" + ")
                      : null;
          return (
            <div key={check.name} className="flex items-start gap-2">
              {checkIcon(check.status)}
              <div className="flex-1 min-w-0">
                <span className="font-medium">{check.name}</span>
                {detailText && <span className="text-muted-foreground ml-1">{detailText}</span>}
                {check.message && (
                  <p className={`mt-0.5 ${check.status === "blocked" ? "text-red-600" : "text-amber-600"}`}>
                    {check.message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {report.topics && report.topics.length > 0 && (
        <div className="text-sm">
          <span className="font-medium">Topics: </span>
          {report.topics.map((t) => (
            <button
              key={t.topic}
              type="button"
              onClick={() => onTopicClick?.(t.topic)}
              className="text-muted-foreground hover:text-foreground ml-1"
            >
              {topicDepthIcon(t.depth)} {t.topic}
            </button>
          ))}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Expected: ~{report.estimatedStoryCount} stories · {report.estimatedGenerationTime}
      </div>

      {report.checks.some((c) => c.status === "warning" && c.message) && (
        <div className="text-sm text-amber-600 space-y-1">
          {report.checks
            .filter((c) => c.status === "warning" && c.message)
            .map((c) => (
              <p key={c.name}>⚠ {c.message}</p>
            ))}
        </div>
      )}
    </div>
  );
}
