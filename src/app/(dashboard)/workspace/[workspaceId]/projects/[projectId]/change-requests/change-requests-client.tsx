"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Check, X, FileCheck } from "lucide-react";

export function ChangeRequestsClient({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [statusFilter, setStatusFilter] = useState<
    "open" | "approved" | "rejected" | "implemented" | ""
  >("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, refetch } = trpc.changeRequest.list.useQuery({
    projectId,
    status: statusFilter || undefined,
  });

  const approve = trpc.changeRequest.approve.useMutation({
    onSuccess: () => refetch(),
  });
  const reject = trpc.changeRequest.reject.useMutation({
    onSuccess: () => {
      setRejectingId(null);
      setRejectReason("");
      refetch();
    },
  });
  const markImplemented = trpc.changeRequest.markImplemented.useMutation({
    onSuccess: () => refetch(),
  });

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

  if (!data) return <div className="text-muted-foreground">Loading...</div>;

  const { changeRequests } = data;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center">
        <span className="text-sm">Filter:</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as "" | "open" | "approved" | "rejected" | "implemented"
            )
          }
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="implemented">Implemented</option>
        </select>
      </div>

      {changeRequests.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          No change requests yet. Change requests are created when source
          updates affect packs that have a baseline.
        </div>
      ) : (
        <ul className="space-y-4">
          {changeRequests.map((cr) => (
            <li
              key={cr.id}
              className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/workspace/${workspaceId}/projects/${projectId}/change-requests/${cr.id}`}
                    className="font-medium hover:underline block"
                  >
                    {cr.title}
                  </Link>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {cr.impactSummary}
                  </p>
                  <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{cr.pack.name}</span>
                    <span>•</span>
                    <span>
                      {(cr.impactedStoryCount ?? 0)} stor
                      {(cr.impactedStoryCount ?? 0) !== 1 ? "ies" : "y"} impacted
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(cr.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium capitalize shrink-0 ${statusBadgeClass(
                    cr.status
                  )}`}
                >
                  {cr.status}
                </span>
              </div>

              {cr.status === "open" && (
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={() => approve.mutate({ id: cr.id })}
                    disabled={approve.isPending}
                    className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Approve
                  </button>
                  {rejectingId === cr.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Rejection reason (required)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="px-2 py-1 border rounded text-sm w-48"
                      />
                      <button
                        onClick={() =>
                          reject.mutate({
                            id: cr.id,
                            reason: rejectReason,
                          })
                        }
                        disabled={
                          reject.isPending || !rejectReason.trim()
                        }
                        className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRejectingId(cr.id)}
                      className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </button>
                  )}
                </div>
              )}

              {cr.status === "approved" && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm text-green-700 mb-2">
                    Impacted stories are now editable.
                  </p>
                  <button
                    onClick={() => markImplemented.mutate({ id: cr.id })}
                    disabled={markImplemented.isPending}
                    className="px-3 py-1.5 border rounded text-sm hover:bg-muted flex items-center gap-1"
                  >
                    <FileCheck className="h-3 w-3" />
                    Mark as Implemented
                  </button>
                </div>
              )}

              {cr.status === "rejected" && cr.rejectionReason && (
                <p className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  Reason: {cr.rejectionReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
