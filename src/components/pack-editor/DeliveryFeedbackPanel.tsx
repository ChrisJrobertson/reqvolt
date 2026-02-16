"use client";

import { trpc } from "@/lib/trpc";

interface DeliveryFeedbackPanelProps {
  storyId: string;
  packId?: string;
}

export function DeliveryFeedbackPanel({ storyId }: DeliveryFeedbackPanelProps) {
  const { data: feedback, refetch } = trpc.deliveryFeedback.listByStory.useQuery(
    { storyId },
    { enabled: !!storyId }
  );
  const resolve = trpc.deliveryFeedback.resolve.useMutation({
    onSuccess: () => refetch(),
  });
  const pushUpdate = trpc.storyExport.pushUpdate.useMutation({
    onSuccess: () => refetch(),
  });

  if (!feedback || feedback.length === 0) return null;

  const unresolved = feedback.filter((f) => !f.isResolved);
  const resolved = feedback.filter((f) => f.isResolved);

  return (
    <div className="mt-3 p-3 rounded-lg border bg-muted/30">
      <h4 className="text-xs font-medium text-muted-foreground mb-2">
        Delivery feedback
      </h4>
      <div className="space-y-2">
        {unresolved.map((f) => (
          <div
            key={f.id}
            className={`p-2 rounded border-l-4 text-sm ${
              f.feedbackType === "rejection"
                ? "border-l-red-500 bg-red-50/50"
                : f.feedbackType === "question"
                  ? "border-l-amber-500 bg-amber-50/50"
                  : "border-l-blue-500 bg-blue-50/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {f.feedbackType === "rejection"
                    ? "Rejected"
                    : f.feedbackType === "question"
                      ? "Question"
                      : "Status change"}
                  {f.storyExport?.externalSystem && (
                    <> · {f.storyExport.externalSystem}</>
                  )}
                </span>
                {f.externalAuthor && (
                  <span className="text-xs text-muted-foreground ml-1">
                    — {f.externalAuthor}
                  </span>
                )}
                {f.content && (
                  <p className="mt-0.5 text-muted-foreground line-clamp-3">
                    {f.content}
                  </p>
                )}
                {f.matchedSignalWords?.length > 0 && (
                  <span className="text-xs text-amber-700">
                    Matched: {f.matchedSignalWords.join(", ")}
                  </span>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {f.storyExport?.externalUrl && (
                  <a
                    href={f.storyExport.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-0.5 rounded border hover:bg-muted"
                  >
                    View
                  </a>
                )}
                <button
                  onClick={() =>
                    resolve.mutate({ feedbackId: f.id })
                  }
                  disabled={resolve.isPending}
                  className="text-xs px-2 py-0.5 rounded border hover:bg-muted disabled:opacity-50"
                >
                  Resolve
                </button>
              </div>
            </div>
          </div>
        ))}
        {resolved.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {resolved.length} resolved
            </summary>
            <ul className="mt-1 space-y-1 pl-2 border-l">
              {resolved.map((f) => (
                <li key={f.id} className="line-through text-muted-foreground">
                  {f.feedbackType}: {f.content?.slice(0, 60)}…
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {unresolved.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Array.from(
            new Set(
              unresolved
                .map((f) => f.storyExport?.externalSystem)
                .filter(Boolean)
            )
          ).map((system) => (
            <button
              key={system}
              onClick={() =>
                pushUpdate.mutate({
                  storyId,
                  targetSystem: system as "jira" | "monday",
                })
              }
              disabled={pushUpdate.isPending}
              className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-50"
            >
              {pushUpdate.isPending ? "Pushing…" : `Push update to ${system === "jira" ? "Jira" : "Monday.com"}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
