"use client";

import { trpc } from "@/lib/trpc";
import { useState } from "react";

export function ReviewPageClient({ token }: { token: string }) {
  const { data, isLoading, error } = trpc.pack.getByReviewToken.useQuery(
    { token },
    { retry: false }
  );
  const [commentEntity, setCommentEntity] = useState<{
    entityType: "story" | "acceptance_criteria";
    entityId: string;
  } | null>(null);
  const [commentText, setCommentText] = useState("");
  const utils = trpc.useUtils();
  const addComment = trpc.pack.addReviewComment.useMutation({
    onSuccess: () => {
      setCommentEntity(null);
      setCommentText("");
      void utils.pack.getByReviewToken.invalidate({ token });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-destructive">
            Review link not found or expired
          </h1>
          <p className="text-muted-foreground mt-2">
            This link may have been revoked or has expired. Please contact the
            pack owner for a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{data.packName}</h1>
        <p className="text-muted-foreground">
          {data.projectName} – Version {data.versionNumber}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only review. Add comments on stories or acceptance criteria.
        </p>
      </header>

      {data.summary && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Summary</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
        </section>
      )}

      {data.nonGoals && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Non-Goals</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{data.nonGoals}</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">User Stories</h2>
        <div className="space-y-6">
          {data.stories.map((story) => (
            <div key={story.id} className="p-4 border rounded-lg">
              <p className="font-medium">{story.persona}</p>
              <p className="text-muted-foreground mt-1">
                <strong>Want:</strong> {story.want}
              </p>
              <p className="text-muted-foreground">
                <strong>So that:</strong> {story.soThat}
              </p>
              <ul className="mt-3 space-y-2">
                {story.acceptanceCriteria.map((ac) => (
                  <li key={ac.id} className="text-sm pl-4 border-l-2">
                    <strong>Given</strong> {ac.given}{" "}
                    <strong>When</strong> {ac.when}{" "}
                    <strong>Then</strong> {ac.then}
                    <button
                      onClick={() =>
                        setCommentEntity({
                          entityType: "acceptance_criteria",
                          entityId: ac.id,
                        })
                      }
                      className="ml-2 text-xs text-primary hover:underline"
                    >
                      Comment
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setCommentEntity({
                    entityType: "story",
                    entityId: story.id,
                  })
                }
                className="mt-2 text-xs text-primary hover:underline"
              >
                Comment on story
              </button>
            </div>
          ))}
        </div>
      </section>

      {data.assumptions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Assumptions</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            {data.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {data.openQuestions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Open Questions</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            {data.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      {commentEntity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="font-semibold mb-2">Add Comment</h3>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Your comment..."
              className="w-full px-4 py-2 border rounded-lg text-sm mb-4 min-h-[100px]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setCommentEntity(null);
                  setCommentText("");
                }}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  addComment.mutate({
                    token,
                    entityType: commentEntity.entityType,
                    entityId: commentEntity.entityId,
                    content: commentText,
                  });
                }}
                disabled={!commentText.trim() || addComment.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {addComment.isPending ? "Sending..." : "Add Comment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {data.comments.length > 0 && (
        <section className="mt-8 pt-8 border-t">
          <h2 className="text-lg font-semibold mb-4">Comments</h2>
          <div className="space-y-2">
            {data.comments.map((c) => (
              <div key={c.id} className="p-3 bg-muted rounded-lg text-sm">
                <span className="text-muted-foreground text-xs">
                  {c.entityType} • {c.entityId}
                </span>
                <p className="mt-1">{c.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
