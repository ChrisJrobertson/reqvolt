"use client";

import { useState, useEffect } from "react";
import { Check, Circle, Loader2 } from "lucide-react";

const STAGES = [
  { id: "analysing", label: "Analysing sources" },
  { id: "themes", label: "Identifying requirement themes" },
  { id: "generating", label: "Generating stories" },
  { id: "linking", label: "Linking evidence" },
  { id: "qa", label: "Running quality checks" },
  { id: "review", label: "Reviewing for accuracy" },
] as const;

export function GenerationProgress({
  estimatedTime,
  onComplete,
}: {
  estimatedTime?: string;
  onComplete?: () => void;
}) {
  const [currentStage, setCurrentStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [stageDurations, setStageDurations] = useState<Record<string, number>>({});

  useEffect(() => {
    const totalDuration = 45000; // ~45s default
    const stageDuration = totalDuration / STAGES.length;
    const interval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev >= STAGES.length - 1) {
          clearInterval(interval);
          onComplete?.();
          return prev;
        }
        const next = prev + 1;
        setCompletedStages((s) => new Set([...s, STAGES[prev]!.id]));
        setStageDurations((d) => ({
          ...d,
          [STAGES[prev]!.id]: Math.round(stageDuration / 1000),
        }));
        return next;
      });
    }, stageDuration);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="rounded-lg border bg-card p-8 max-w-md mx-auto text-center space-y-6">
      <h3 className="text-lg font-semibold">Generating your story pack...</h3>

      <div className="space-y-3 text-left">
        {STAGES.map((stage, i) => {
          const isCompleted = completedStages.has(stage.id);
          const isActive = i === currentStage && !isCompleted;
          const duration = stageDurations[stage.id];

          return (
            <div key={stage.id} className="flex items-center gap-3">
              {isCompleted ? (
                <Check className="h-5 w-5 text-green-600 shrink-0" />
              ) : isActive ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className={isActive ? "font-medium" : "text-muted-foreground"}>
                {stage.label}
              </span>
              {duration != null && (
                <span className="text-muted-foreground text-sm ml-auto">{duration}s</span>
              )}
              {isActive && stage.id === "generating" && (
                <div className="ml-2 flex-1 max-w-[100px] h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary animate-pulse"
                    style={{ width: "60%" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Estimated time remaining: {estimatedTime ?? "About 45 seconds"}
      </p>
    </div>
  );
}
