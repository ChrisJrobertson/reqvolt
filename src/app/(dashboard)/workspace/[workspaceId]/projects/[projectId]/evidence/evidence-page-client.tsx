"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { FileText, Search, AlertTriangle } from "lucide-react";

const TAG_COLOURS: Record<string, string> = {
  REQUIREMENT: "bg-blue-100 text-blue-800",
  DECISION: "bg-purple-100 text-purple-800",
  COMMITMENT: "bg-green-100 text-green-800",
  QUESTION: "bg-amber-100 text-amber-800",
  CONTEXT: "bg-slate-100 text-slate-800",
  CONSTRAINT: "bg-red-100 text-red-800",
  unclassified: "bg-muted text-muted-foreground",
};

interface Source {
  id: string;
  name: string;
}

export function EvidencePageClient({
  workspaceId,
  projectId,
  sources,
  isAdmin,
}: {
  workspaceId: string;
  projectId: string;
  sources: Source[];
  isAdmin?: boolean;
}) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "conflicts" ? "conflicts" : "evidence";
  const [tab, setTab] = useState<"evidence" | "conflicts">(initialTab);
  const [sourceId, setSourceId] = useState<string>("");
  const [classificationTag, setClassificationTag] = useState<string>("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<{
    conflictId: string;
    resolution: string;
    note: string;
  } | null>(null);
  const [redactModal, setRedactModal] = useState<{ chunkId: string } | null>(null);

  const { data: stats } = trpc.evidenceLedger.stats.useQuery({ projectId });
  const { data: conflicts } = trpc.evidenceLedger.conflicts.useQuery(
    { projectId },
    { enabled: tab === "conflicts" }
  );
  const utils = trpc.useUtils();
  const resolveConflict = trpc.evidenceLedger.resolveConflict.useMutation({
    onSuccess: () => {
      utils.evidenceLedger.conflicts.invalidate({ projectId });
      setResolveModal(null);
    },
  });
  const triggerDetection = trpc.evidenceLedger.triggerConflictDetection.useMutation({
    onSuccess: () => {
      utils.evidenceLedger.conflicts.invalidate({ projectId });
    },
  });
  const redactEvidence = trpc.retention.redactEvidence.useMutation({
    onSuccess: () => {
      setRedactModal(null);
      utils.evidenceLedger.list.invalidate();
      utils.evidenceLedger.stats.invalidate({ projectId });
    },
  });
  const { data: listData, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.evidenceLedger.list.useInfiniteQuery(
      {
        projectId,
        sourceId: sourceId || undefined,
        classificationTag: (classificationTag || undefined) as
          | "REQUIREMENT"
          | "DECISION"
          | "COMMITMENT"
          | "QUESTION"
          | "CONTEXT"
          | "CONSTRAINT"
          | undefined,
        search: search || undefined,
        limit: 50,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }
    );

  const items = listData?.pages.flatMap((p) => p.items) ?? [];
  const unresolvedCount = conflicts?.filter((c) => !c.resolution).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("evidence")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "evidence" ? "border-primary" : "border-transparent"
          }`}
        >
          Evidence
        </button>
        <button
          onClick={() => setTab("conflicts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
            tab === "conflicts" ? "border-primary" : "border-transparent"
          }`}
        >
          Conflicts
          {unresolvedCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">
              {unresolvedCount}
            </span>
          )}
        </button>
      </div>

      {tab === "conflicts" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Contradictions between evidence from different sources
            </p>
            <button
              onClick={() => triggerDetection.mutate({ projectId })}
              disabled={triggerDetection.isPending}
              className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
            >
              {triggerDetection.isPending ? "Running…" : "Detect conflicts"}
            </button>
          </div>
          <div className="border rounded-lg divide-y">
            {!conflicts || conflicts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No conflicts detected. Run detection to check for contradictions.</p>
              </div>
            ) : (
              conflicts.map((c) => (
                <div key={c.id} className="p-4">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="p-3 bg-muted/30 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        {c.chunkA.source.name}
                      </div>
                      <p className="text-sm">{c.chunkA.content.slice(0, 300)}…</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        {c.chunkB.source.name}
                      </div>
                      <p className="text-sm">{c.chunkB.content.slice(0, 300)}…</p>
                    </div>
                  </div>
                  <p className="text-sm text-amber-700 mb-2">{c.conflictSummary}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(c.confidence * 100)}%
                    </span>
                    {!c.resolution ? (
                      <button
                        onClick={() =>
                          setResolveModal({
                            conflictId: c.id,
                            resolution: "",
                            note: "",
                          })
                        }
                        className="text-sm text-primary hover:underline"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                        {c.resolution?.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "evidence" && (
        <>
      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {(["REQUIREMENT", "DECISION", "COMMITMENT", "QUESTION", "CONTEXT", "CONSTRAINT", "unclassified"] as const).map(
            (tag) => (
              <div
                key={tag}
                className="p-4 border rounded-lg bg-muted/30"
              >
                <div className="text-2xl font-bold">
                  {stats.counts[tag] ?? 0}
                </div>
                <div className="text-sm text-muted-foreground capitalize">
                  {tag}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search evidence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"
          />
        </div>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm bg-background"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={classificationTag}
          onChange={(e) => setClassificationTag(e.target.value)}
          className="px-4 py-2 border rounded-lg text-sm bg-background"
        >
          <option value="">All types</option>
          <option value="REQUIREMENT">Requirement</option>
          <option value="DECISION">Decision</option>
          <option value="COMMITMENT">Commitment</option>
          <option value="QUESTION">Question</option>
          <option value="CONTEXT">Context</option>
          <option value="CONSTRAINT">Constraint</option>
          <option value="unclassified">Unclassified</option>
        </select>
      </div>

      {/* Evidence list */}
      <div className="border rounded-lg divide-y">
        {items.length === 0 && !isFetchingNextPage ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No evidence items found. Upload sources and generate packs to populate the ledger.</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-4 hover:bg-muted/30 cursor-pointer"
              onClick={() =>
                setExpandedId(expandedId === item.id ? null : item.id)
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {expandedId === item.id
                      ? item.content
                      : `${item.content.slice(0, 150)}${item.content.length > 150 ? "…" : ""}`}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {item.sourceName} · {item.sourceType}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        TAG_COLOURS[item.classificationTag ?? "unclassified"]
                      }`}
                    >
                      {item.classificationTag ?? "Unclassified"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.evidenceLinkCount} link{item.evidenceLinkCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
              {expandedId === item.id && (
                <div className="mt-3 pt-3 border-t flex items-center gap-4">
                  <Link
                    href={`/workspace/${workspaceId}/projects/${projectId}?source=${item.sourceId}#chunk-${item.id}`}
                    className="text-sm text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View in source →
                  </Link>
                  {isAdmin && !item.redactedAt && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRedactModal({ chunkId: item.id });
                      }}
                      className="text-sm text-destructive hover:underline"
                    >
                      Redact
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        {hasNextPage && (
          <div className="p-4 text-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
        </>
      )}

      {redactModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">Redact evidence</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will replace the evidence text with [REDACTED]. The link structure will be
              preserved. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRedactModal(null)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  redactEvidence.mutate({ chunkId: redactModal.chunkId });
                }}
                disabled={redactEvidence.isPending}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50"
              >
                {redactEvidence.isPending ? "Redacting…" : "Redact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resolveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">Resolve conflict</h3>
            <select
              value={resolveModal.resolution}
              onChange={(e) =>
                setResolveModal((m) => m && { ...m, resolution: e.target.value })
              }
              className="w-full px-4 py-2 border rounded-lg mb-3"
            >
              <option value="">Select resolution</option>
              <option value="source_a_preferred">Prefer Source A</option>
              <option value="source_b_preferred">Prefer Source B</option>
              <option value="both_valid">Both valid</option>
              <option value="dismissed">Dismiss</option>
            </select>
            <textarea
              placeholder="Resolution note (required)"
              value={resolveModal.note}
              onChange={(e) =>
                setResolveModal((m) => m && { ...m, note: e.target.value })
              }
              className="w-full px-4 py-2 border rounded-lg mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResolveModal(null)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (resolveModal.resolution && resolveModal.note.trim()) {
                    resolveConflict.mutate({
                      conflictId: resolveModal.conflictId,
                      resolution: resolveModal.resolution as
                        | "source_a_preferred"
                        | "source_b_preferred"
                        | "both_valid"
                        | "dismissed",
                      resolutionNote: resolveModal.note.trim(),
                    });
                  }
                }}
                disabled={
                  !resolveModal.resolution ||
                  !resolveModal.note.trim() ||
                  resolveConflict.isPending
                }
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
