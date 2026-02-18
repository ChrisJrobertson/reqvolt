"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ThumbsUp, ThumbsDown } from "lucide-react";

export function StoryFeedbackToggle({
  storyId,
  packId,
  initialRating,
}: {
  storyId: string;
  packId?: string;
  initialRating?: "UP" | "DOWN" | null;
}) {
  const [rating, setRating] = useState<"UP" | "DOWN" | null>(() => initialRating ?? null);
  const utils = trpc.useUtils();
  const rateStory = trpc.feedback.rateStory.useMutation({
    onError: () => setRating(initialRating ?? null),
    onSuccess: () => packId && utils.feedback.getStoryFeedback.invalidate({ packId }),
  });

  const clearFeedback = trpc.feedback.clearStoryFeedback.useMutation({
    onError: () => setRating(initialRating ?? null),
    onSuccess: () => packId && utils.feedback.getStoryFeedback.invalidate({ packId }),
  });

  const handleClick = (newRating: "UP" | "DOWN") => {
    const next = rating === newRating ? null : newRating;
    setRating(next);
    if (next) {
      rateStory.mutate({ storyId, rating: next });
    } else {
      clearFeedback.mutate({ storyId });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => handleClick("UP")}
        className={`p-1 rounded hover:bg-muted ${rating === "UP" ? "text-green-600" : "text-muted-foreground"}`}
        aria-label="Thumbs up"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleClick("DOWN")}
        className={`p-1 rounded hover:bg-muted ${rating === "DOWN" ? "text-red-600" : "text-muted-foreground"}`}
        aria-label="Thumbs down"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
}
