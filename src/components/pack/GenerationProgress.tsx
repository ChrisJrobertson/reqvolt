"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

interface GenerationProgressProps {
  active: boolean;
  estimatedTimeLabel?: string;
}

interface StageConfig {
  key: string;
  label: string;
  durationSec: number;
}

function parseEstimatedSeconds(label?: string): number {
  if (!label) return 45;
  const match = label.match(/(\d+)/);
  if (!match) return 45;
  return Number(match[1]);
}

export function GenerationProgress({
  active,
  estimatedTimeLabel,
}: GenerationProgressProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  const stages = useMemo<StageConfig[]>(() => {
    const totalSec = parseEstimatedSeconds(estimatedTimeLabel);
    const generationSec = Math.max(8, Math.round(totalSec * 0.45));
    const linkingSec = Math.max(4, Math.round(totalSec * 0.18));
    const checksSec = Math.max(4, Math.round(totalSec * 0.2));
    const reviewSec = Math.max(3, Math.round(totalSec * 0.12));

    return [
      { key: "analysis", label: "Analysing sources", durationSec: 3 },
      { key: "themes", label: "Identifying requirement themes", durationSec: 2 },
      { key: "generation", label: "Generating stories", durationSec: generationSec },
      { key: "linking", label: "Linking evidence", durationSec: linkingSec },
      { key: "checks", label: "Running quality checks", durationSec: checksSec },
      { key: "review", label: "Reviewing for accuracy", durationSec: reviewSec },
    ];
  }, [estimatedTimeLabel]);

  const totalDurationMs = stages.reduce((sum, stage) => sum + stage.durationSec * 1000, 0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  let cumulativeMs = 0;
  const stageState = stages.map((stage) => {
    const stageStart = cumulativeMs;
    const stageDurationMs = stage.durationSec * 1000;
    const stageEnd = stageStart + stageDurationMs;
    cumulativeMs = stageEnd;

    if (elapsedMs >= stageEnd) {
      return { ...stage, state: "done" as const, progress: 100 };
    }
    if (elapsedMs >= stageStart) {
      const progress = Math.round(((elapsedMs - stageStart) / stageDurationMs) * 100);
      return { ...stage, state: "active" as const, progress };
    }
    return { ...stage, state: "pending" as const, progress: 0 };
  });

  const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const estimatedText = estimatedTimeLabel ?? "About 45 seconds";

  return (
    <div className="rounded-lg border bg-background p-6">
      <h3 className="text-lg font-semibold">Generating your story pack…</h3>
      <div className="mt-4 space-y-2.5">
        {stageState.map((stage) => (
          <div key={stage.key} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={
                    stage.state === "done"
                      ? "text-green-600"
                      : stage.state === "active"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                  }
                >
                  {stage.state === "done" ? "✓" : stage.state === "active" ? "●" : "○"}
                </span>
                <span>{stage.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {stage.state === "done"
                  ? `${stage.durationSec}s`
                  : stage.state === "active"
                    ? `${stage.progress}%`
                    : ""}
              </span>
            </div>
            {stage.key === "generation" && stage.state === "active" && (
              <div className="mt-1 h-2 rounded-full bg-muted">
                <motion.div
                  className="h-2 rounded-full bg-primary"
                  animate={{ width: `${Math.max(4, stage.progress)}%` }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Estimated time remaining: {remainingSec > 0 ? `~${remainingSec} seconds` : estimatedText}
      </p>
    </div>
  );
}
