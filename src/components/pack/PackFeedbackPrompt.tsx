"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

interface PackFeedbackPromptProps {
  packId: string;
}

const DISPLAY_DELAY_MS = 60_000;

export function PackFeedbackPrompt({ packId }: PackFeedbackPromptProps) {
  const [visible, setVisible] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const query = trpc.feedback.getPackFeedback.useQuery({ packId });
  const ratePack = trpc.feedback.ratePack.useMutation({
    onSuccess: () => {
      query.refetch();
      setVisible(false);
    },
  });

  const sessionKey = useMemo(() => `pack-feedback-skip:${packId}`, [packId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const skipped = window.sessionStorage.getItem(sessionKey) === "1";
    if (skipped) {
      setDismissedThisSession(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), DISPLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessionKey]);

  if (dismissedThisSession || !visible) return null;
  if (query.data?.currentUserRating) return null;

  const submit = (rating: "POSITIVE" | "NEUTRAL" | "NEGATIVE") => {
    ratePack.mutate({ packId, rating });
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(760px,94vw)] -translate-x-1/2 rounded-xl border bg-background p-4 shadow-lg">
      <p className="text-sm font-medium">How useful was this generation?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => submit("POSITIVE")}
          className="rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          Saved me time ✓
        </button>
        <button
          onClick={() => submit("NEUTRAL")}
          className="rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          Needed editing ✎
        </button>
        <button
          onClick={() => submit("NEGATIVE")}
          className="rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          Not useful ✗
        </button>
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(sessionKey, "1");
            }
            setDismissedThisSession(true);
            setVisible(false);
          }}
          className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
