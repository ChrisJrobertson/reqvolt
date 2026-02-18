"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Check, Edit3, X } from "lucide-react";

const PACK_FEEDBACK_SKIP_KEY = "pack-feedback-skip";

export function PackFeedbackPrompt({
  packId,
  onDismiss,
}: {
  packId: string;
  onDismiss?: () => void;
}) {
  const [visible, setVisible] = useState(false);

  const { data: packFeedback } = trpc.feedback.getPackFeedback.useQuery(
    { packId },
    { enabled: !!packId }
  );
  const ratePack = trpc.feedback.ratePack.useMutation({
    onSuccess: () => {
      setVisible(false);
      onDismiss?.();
    },
  });

  useEffect(() => {
    if (!packId || packFeedback?.currentUserRating) return;
    if (typeof window !== "undefined" && sessionStorage.getItem(PACK_FEEDBACK_SKIP_KEY)) return;

    const timer = setTimeout(() => setVisible(true), 60000);
    return () => clearTimeout(timer);
  }, [packId, packFeedback?.currentUserRating]);

  const handleSkip = () => {
    sessionStorage.setItem(PACK_FEEDBACK_SKIP_KEY, "1");
    setVisible(false);
    onDismiss?.();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-lg border bg-card shadow-lg p-4 max-w-md">
        <p className="text-sm font-medium mb-3">How useful was this generation?</p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => ratePack.mutate({ packId, rating: "POSITIVE" })}
            disabled={ratePack.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 text-sm"
          >
            <Check className="h-4 w-4" />
            Saved me time
          </button>
          <button
            type="button"
            onClick={() => ratePack.mutate({ packId, rating: "NEUTRAL" })}
            disabled={ratePack.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 text-sm"
          >
            <Edit3 className="h-4 w-4" />
            Needed editing
          </button>
          <button
            type="button"
            onClick={() => ratePack.mutate({ packId, rating: "NEGATIVE" })}
            disabled={ratePack.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 hover:bg-red-200 text-sm"
          >
            <X className="h-4 w-4" />
            Not useful
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground px-2"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
