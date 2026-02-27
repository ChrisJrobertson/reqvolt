"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Check, X, FileCheck } from "lucide-react";

export function ChangeRequestDetailClient({
  workspaceId,
  projectId,
  crId,
}: {
  workspaceId: string;
  projectId: string;
  crId: string;
}) {
  const [rejectReason, setRejectReason] = useState("");

  const { data: cr, refetch } = trpc.changeRequest.getById.useQuery({ id: crId });

  const approve = trpc.changeRequest.approve.useMutation({
    onSuccess: () => refetch(),
  });
  const reject = trpc.changeRequest.reject.useMutation({
    onSuccess: () => refetch(),
  });
  const markImplemented = trpc.changeRequest.markImplemented.useMutation({
    onSuccess: () => refetch(),
  });

  const impactedStoryIds = Array.isArray(cr?.impactedStoryIds)
    ? (cr.impactedStoryIds as string[])
    : [];

  if (!cr) return <div className="text-muted-foreground">Loading...</div>;

  const statusBadgeClass = (s: string) => {
    switch (s) {
      case "open":
        return "bg-amber-100 text-amber-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "implemented":
        return "bg-slate-100 text-slate-700";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded text-sm font-medium capitalize ${statusBadgeClass(
            cr.status
          )}`}
        >
          {cr.status}
        </span>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Description</h2>
        <p className="text-muted-foreground whitespace-pre-wrap">{cr.description}</p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Impact Summary</h2>
        <p className="text-muted-foreground">{cr.impactSummary}</p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Trigger</h2>
        <p className="text-muted-foreground">{cr.trigger}</p>
      </section>

      <section>
        <h2 className="font-semibold mb-2">
          Impacted Stories ({impactedStoryIds.length})
        </h2>
        <p className="text-sm text-muted-foreground mb-2">
          These stories are linked to evidence that changed in the source.
        </p>
        <ul className="space-y-2">
          {impactedStoryIds.map((storyId) => (
            <li key={storyId}>
              <Link
                href={`/workspace/${workspaceId}/projects/${projectId}/packs/${cr.pack.id}`}
                className="text-primary hover:underline"
              >
                Story {storyId.slice(-6)}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}/packs/${cr.pack.id}`}
          className="inline-block mt-2 text-sm text-primary hover:underline"
        >
          View pack →
        </Link>
      </section>

      {cr.status === "open" && (
        <section className="flex gap-4 pt-4 border-t">
          <button
            onClick={() => approve.mutate({ id: crId })}
            disabled={approve.isPending}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="h-4 w-4" />
            Approve
          </button>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Rejection reason (required)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="px-3 py-2 border rounded"
            />
            <button
              onClick={() => reject.mutate({ id: crId, reason: rejectReason })}
              disabled={reject.isPending || !rejectReason.trim()}
              className="px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </div>
        </section>
      )}

      {cr.status === "approved" && (
        <section className="pt-4 border-t">
          <p className="text-green-700 mb-2">
            Impacted stories are now editable. Edit the pack, then mark as
            implemented when done.
          </p>
          <button
            onClick={() => markImplemented.mutate({ id: crId })}
            disabled={markImplemented.isPending}
            className="px-4 py-2 border rounded hover:bg-muted flex items-center gap-2"
          >
            <FileCheck className="h-4 w-4" />
            Mark as Implemented
          </button>
        </section>
      )}

      {cr.status === "rejected" && cr.rejectionReason && (
        <section className="pt-4 border-t">
          <h2 className="font-semibold mb-2">Rejection Reason</h2>
          <p className="text-muted-foreground">{cr.rejectionReason}</p>
        </section>
      )}
    </div>
  );
}
