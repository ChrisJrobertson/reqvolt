"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { MentionInput, type MentionOption } from "@/components/MentionInput";
import { MessageSquare, Check, Trash2, Reply } from "lucide-react";

function renderContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    parts.push(text.slice(lastIndex, m.index));
    parts.push(
      <span key={m.index} className="font-medium text-primary">
        @{m[1]}
      </span>
    );
    lastIndex = m.index + (m[0]?.length ?? 0);
  }
  parts.push(text.slice(lastIndex));
  return parts;
}

interface CommentWithReplies {
  id: string;
  content: string;
  mentions: string[];
  createdBy: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  parentId: string | null;
  replies?: Array<{
    id: string;
    content: string;
    createdBy: string;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedBy: string | null;
  }>;
}

export function StoryDiscussionPanel({ storyId }: { storyId: string }) {
  const [newContent, setNewContent] = useState("");
  const [newMentions, setNewMentions] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyMentions, setReplyMentions] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const { data: comments = [] } = trpc.storyComment.list.useQuery({ storyId });
  const { data: members = [] } = trpc.storyComment.listWorkspaceMembers.useQuery();

  const createComment = trpc.storyComment.create.useMutation({
    onSuccess: () => {
      utils.storyComment.list.invalidate({ storyId });
      setNewContent("");
      setNewMentions([]);
    },
  });
  const resolveComment = trpc.storyComment.resolve.useMutation({
    onSuccess: () => utils.storyComment.list.invalidate({ storyId }),
  });
  const deleteComment = trpc.storyComment.delete.useMutation({
    onSuccess: () => utils.storyComment.list.invalidate({ storyId }),
  });

  const memberOptions: MentionOption[] = members.map((m) => ({
    id: m.id,
    label: m.label,
    email: m.email,
  }));

  const getAuthorLabel = (userId: string) => {
    const m = members.find((x) => x.id === userId);
    return m?.label ?? "User";
  };

  const handleSubmitNew = () => {
    if (!newContent.trim()) return;
    createComment.mutate({
      storyId,
      content: newContent.trim(),
      mentions: newMentions,
    });
  };

  const handleSubmitReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    createComment.mutate({
      storyId,
      content: replyContent.trim(),
      parentId,
      mentions: replyMentions,
    });
    setReplyingTo(null);
    setReplyContent("");
    setReplyMentions([]);
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Discussion</h3>
      </div>

      <div className="space-y-3">
        {comments.map((c) => (
          <CommentThread
            key={c.id}
            comment={c}
            getAuthorLabel={getAuthorLabel}
            memberOptions={memberOptions}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            replyContent={replyContent}
            onReplyChange={(content, mentions) => {
              setReplyContent(content);
              setReplyMentions(mentions);
            }}
            onSubmitReply={() => handleSubmitReply(c.id)}
            onResolve={(resolved) =>
              resolveComment.mutate({ commentId: c.id, resolved })
            }
            onDelete={() => {
              if (confirm("Delete this comment?")) deleteComment.mutate({ commentId: c.id });
            }}
            onResolveReply={(commentId, resolved) =>
              resolveComment.mutate({ commentId, resolved })
            }
            onDeleteReply={(commentId) => {
              if (confirm("Delete this comment?")) deleteComment.mutate({ commentId });
            }}
            isResolving={resolveComment.isPending}
            isDeleting={deleteComment.isPending}
            isSubmittingReply={createComment.isPending}
          />
        ))}
      </div>

      <div className="mt-4">
        <MentionInput
          value={newContent}
          onChange={(v, m) => {
            setNewContent(v);
            setNewMentions(m);
          }}
          options={memberOptions}
          placeholder="Add a comment… Use @ to mention"
          onSubmit={handleSubmitNew}
        />
        <button
          onClick={handleSubmitNew}
          disabled={!newContent.trim() || createComment.isPending}
          className="mt-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {createComment.isPending ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

function CommentThread({
  comment,
  getAuthorLabel,
  memberOptions,
  replyingTo,
  setReplyingTo,
  replyContent,
  onReplyChange,
  onSubmitReply,
  onResolve,
  onDelete,
  onResolveReply,
  onDeleteReply,
  isResolving,
  isDeleting,
  isSubmittingReply,
}: {
  comment: CommentWithReplies;
  getAuthorLabel: (id: string) => string;
  memberOptions: MentionOption[];
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyContent: string;
  onReplyChange: (content: string, mentions: string[]) => void;
  onSubmitReply: () => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onResolveReply: (commentId: string, resolved: boolean) => void;
  onDeleteReply: (commentId: string) => void;
  isResolving: boolean;
  isDeleting: boolean;
  isSubmittingReply: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        comment.resolvedAt ? "bg-muted/30 opacity-75" : "bg-muted/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {getAuthorLabel(comment.createdBy)} ·{" "}
            {new Date(comment.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <p className="mt-0.5 text-sm whitespace-pre-wrap">{renderContent(comment.content)}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {comment.resolvedAt ? (
            <button
              onClick={() => onResolve(false)}
              disabled={isResolving}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              title="Unresolve"
            >
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </button>
          ) : (
            <button
              onClick={() => onResolve(true)}
              disabled={isResolving}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              title="Resolve"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950/50 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
          className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Reply className="h-3 w-3" />
          Reply
        </button>
      </div>
      {replyingTo === comment.id && (
        <div className="mt-3 pl-4 border-l-2">
          <MentionInput
            value={replyContent}
            onChange={(v, m) => onReplyChange(v, m)}
            options={memberOptions}
            placeholder="Write a reply…"
            onSubmit={() => onSubmitReply()}
          />
          <button
            onClick={() => onSubmitReply()}
            disabled={!replyContent.trim() || isSubmittingReply}
            className="mt-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {isSubmittingReply ? "Posting…" : "Reply"}
          </button>
          <button
            onClick={() => {
              setReplyingTo(null);
              onReplyChange("", []);
            }}
            className="mt-2 ml-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}
      {(comment.replies?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-2 pl-4 border-l-2">
          {(comment.replies ?? []).map((r) => (
            <div key={r.id} className="p-2 rounded bg-background/50">
              <span className="text-xs font-medium text-muted-foreground">
                {getAuthorLabel(r.createdBy)} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">{renderContent(r.content)}</p>
              <div className="mt-1 flex gap-1">
                {r.resolvedAt ? (
                  <button
                    onClick={() => onResolveReply(r.id, false)}
                    className="text-xs text-green-600 dark:text-green-400"
                  >
                    Resolved
                  </button>
                ) : (
                  <button
                    onClick={() => onResolveReply(r.id, true)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Resolve
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Delete?")) onDeleteReply(r.id);
                  }}
                  className="text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
