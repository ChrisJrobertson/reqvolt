"use client";

import { useState } from "react";

interface StoryFeedbackToggleProps {
  rating: "UP" | "DOWN" | null;
  onRate: (rating: "UP" | "DOWN" | null) => Promise<void> | void;
  disabled?: boolean;
}

export function StoryFeedbackToggle({
  rating,
  onRate,
  disabled = false,
}: StoryFeedbackToggleProps) {
  const [optimisticRating, setOptimisticRating] = useState<"UP" | "DOWN" | null>(rating);

  async function handleRate(next: "UP" | "DOWN") {
    if (disabled) return;
    const finalRating = optimisticRating === next ? null : next;
    const previous = optimisticRating;
    setOptimisticRating(finalRating);
    try {
      await onRate(finalRating);
    } catch {
      setOptimisticRating(previous);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleRate("UP")}
        disabled={disabled}
        className={`text-sm transition-colors ${
          optimisticRating === "UP" ? "text-green-600" : "text-muted-foreground"
        }`}
        aria-label="Thumbs up story quality"
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => void handleRate("DOWN")}
        disabled={disabled}
        className={`text-sm transition-colors ${
          optimisticRating === "DOWN" ? "text-red-600" : "text-muted-foreground"
        }`}
        aria-label="Thumbs down story quality"
      >
        👎
      </button>
    </div>
  );
}
