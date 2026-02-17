"use client";

interface TopicCoverage {
  topic: string;
  depth: "detailed" | "moderate" | "mentioned" | "minimal";
  chunkCount: number;
}

interface ReadinessCheck {
  name: string;
  status: "pass" | "warning" | "blocked";
  message: string | null;
  details?: Record<string, unknown>;
}

interface ReadinessReport {
  overallStatus: "ready" | "warnings" | "blocked";
  checks: ReadinessCheck[];
  topics: TopicCoverage[];
  estimatedStoryCount: number;
  estimatedGenerationTime: string;
}

interface SourceReadinessPanelProps {
  report?: ReadinessReport;
  isLoading: boolean;
  onTopicClick?: (topic: string) => void;
}

function getDepthIndicator(depth: TopicCoverage["depth"]): string {
  if (depth === "detailed") return "●";
  if (depth === "moderate") return "◐";
  if (depth === "mentioned") return "◐";
  return "○";
}

function getStatusIcon(status: ReadinessCheck["status"]): string {
  if (status === "pass") return "✓";
  if (status === "warning") return "⚠";
  return "✗";
}

function getOverallBadge(status: ReadinessReport["overallStatus"]) {
  if (status === "ready") return { label: "Ready", className: "text-green-700" };
  if (status === "warnings") return { label: "Warnings", className: "text-amber-700" };
  return { label: "Blocked", className: "text-red-700" };
}

export function SourceReadinessPanel({
  report,
  isLoading,
  onTopicClick,
}: SourceReadinessPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
        Assessing source readiness…
      </div>
    );
  }

  if (!report) return null;
  const badge = getOverallBadge(report.overallStatus);

  const warnings = report.checks.filter(
    (check) => check.status === "warning" && check.message
  );
  const blocked = report.checks.filter(
    (check) => check.status === "blocked" && check.message
  );

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Source Readiness</h3>
        <span className={`text-xs font-medium ${badge.className}`}>● {badge.label}</span>
      </div>

      <div className="space-y-1.5 text-sm">
        {report.checks.map((check) => (
          <div key={check.name} className="flex items-start gap-2">
            <span
              className={
                check.status === "pass"
                  ? "text-green-600"
                  : check.status === "warning"
                    ? "text-amber-600"
                    : "text-red-600"
              }
            >
              {getStatusIcon(check.status)}
            </span>
            <p>
              <span className="font-medium">{check.name}</span>
              {check.message ? ` — ${check.message}` : ""}
            </p>
          </div>
        ))}
      </div>

      {report.topics.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/30 p-2.5 text-xs">
          <p className="mb-1 font-medium text-muted-foreground">Topic coverage</p>
          <div className="flex flex-wrap gap-1.5">
            {report.topics.map((topic) => (
              <button
                key={`${topic.topic}-${topic.depth}`}
                type="button"
                onClick={() => onTopicClick?.(topic.topic)}
                className="rounded-full border px-2 py-0.5 hover:bg-muted"
                title={`${topic.chunkCount} chunks`}
              >
                {getDepthIndicator(topic.depth)} {topic.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Expected: ~{report.estimatedStoryCount} stories · {report.estimatedGenerationTime}
      </p>

      {warnings.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-amber-700">
          {warnings.map((warning) => (
            <p key={`warn-${warning.name}`}>⚠ {warning.message}</p>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-red-700">
          {blocked.map((item) => (
            <p key={`blocked-${item.name}`}>✗ {item.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
