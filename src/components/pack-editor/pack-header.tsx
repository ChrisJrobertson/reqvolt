"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ChevronDown } from "lucide-react";
import { PackHealthBadge } from "./pack-health-badge";
import { GitBranch } from "lucide-react";

interface Source {
  id: string;
  name: string;
  type: string;
}

interface PackVersion {
  id: string;
  versionNumber: number;
  editLockUserId?: string | null;
  stories?: Array<{ id: string; persona: string }>;
}

interface Pack {
  id: string;
  name: string;
  project: { name: string };
  versions: PackVersion[];
  healthScore?: number | null;
  healthStatus?: string | null;
  reviewStatus?: string | null;
  divergedFromBaseline?: boolean;
}

export function PackHeader({
  pack,
  sources,
  selectedVersionIndex,
  onVersionChange,
  workspaceId,
  projectId,
}: {
  pack: Pack;
  sources: Source[];
  selectedVersionIndex: number;
  onVersionChange: (index: number) => void;
  workspaceId: string;
  projectId: string;
}) {
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [regenerateSourceIds, setRegenerateSourceIds] = useState<Set<string>>(
    new Set()
  );
  const [refreshSourceIds, setRefreshSourceIds] = useState<Set<string>>(
    new Set()
  );
  const [regenerateNotes, setRegenerateNotes] = useState("");
  const [refreshNotes, setRefreshNotes] = useState("");

  const latestVersion = pack.versions[0];
  const selectedVersion = pack.versions[selectedVersionIndex] ?? latestVersion;

  const { data: exportsData } = trpc.storyExport.list.useQuery(
    { packId: pack.id },
    { enabled: !!pack.id }
  );
  const hasExports = (exportsData?.total ?? 0) > 0;
  const triggerSync = trpc.storyExport.triggerSync.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const { data: newSourcesData } = trpc.pack.hasNewSources.useQuery({
    packId: pack.id,
    projectId,
  });
  const { data: reviewLink } = trpc.pack.getReviewLink.useQuery(
    { packVersionId: selectedVersion?.id ?? "" },
    { enabled: !!selectedVersion?.id }
  );
  const { data: mondayConnection } = trpc.monday.getConnection.useQuery();
  const { data: jiraConnection } = trpc.jira.getConnection.useQuery();


  const regenerate = trpc.pack.regenerate.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const refresh = trpc.pack.refresh.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const shareForReview = trpc.pack.shareForReview.useMutation({
    onSuccess: (data) => {
      void navigator.clipboard.writeText(
        `${typeof window !== "undefined" ? window.location.origin : ""}${data.url}`
      );
      setShareResult(data);
      setShowShareModal(true);
    },
  });
  const createSnapshot = trpc.pack.createVersionSnapshot.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const lockVersion = trpc.pack.lockVersion.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const unlockVersion = trpc.pack.unlockVersion.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const revokeReview = trpc.pack.revokeReviewLink.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const [showPushModal, setShowPushModal] = useState(false);
  const [showPushJiraModal, setShowPushJiraModal] = useState(false);
  const [pushJiraProjectKey, setPushJiraProjectKey] = useState("");
  const [pushStoryIds, setPushStoryIds] = useState<Set<string>>(new Set());
  const pushToMonday = trpc.monday.push.useMutation({
    onSuccess: (data) => {
      const failed = data.results.filter((r) => r.error);
      if (failed.length > 0) {
        alert(`${failed.length} story(ies) failed to push. Check the logs.`);
      }
      setShowPushModal(false);
      window.location.reload();
    },
  });
  const pushToJira = trpc.jira.push.useMutation({
    onSuccess: (data) => {
      const failed = data.results.filter((r) => r.status === "failed");
      if (failed.length > 0) {
        alert(`${failed.length} story(ies) failed to push. Check the logs.`);
      }
      setShowPushJiraModal(false);
      window.location.reload();
    },
  });

  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const createApproval = trpc.approval.create.useMutation({
    onSuccess: (data) => {
      void navigator.clipboard.writeText(data.approveUrl);
      setShowApprovalModal(false);
      setApproverName("");
      setApproverEmail("");
      window.location.reload();
    },
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setShowExportDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareResult, setShareResult] = useState<{
    url: string;
    token: string;
    expiresAt: Date;
  } | null>(null);

  return (
    <>
      <header className="mb-6">
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← {pack.project.name}
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{pack.name}</h1>
          <Link
            href={`/workspace/${workspaceId}/projects/${projectId}/packs/${pack.id}/traceability`}
            className="px-4 py-2 border rounded-lg hover:bg-muted text-sm flex items-center gap-2"
          >
            <GitBranch className="h-4 w-4" />
            View Traceability
          </Link>
          {pack.healthScore != null && pack.healthStatus && (
            <PackHealthBadge
              score={pack.healthScore}
              status={
                pack.healthStatus as
                  | "healthy"
                  | "stale"
                  | "at_risk"
                  | "outdated"
              }
            />
          )}
          {pack.versions.length > 1 && (
            <select
              value={selectedVersionIndex}
              onChange={(e) => onVersionChange(Number(e.target.value))}
              className="text-sm px-2 py-1 rounded border bg-background"
            >
              {pack.versions.map((v, i) => (
                <option key={v.id} value={i}>
                  v{v.versionNumber}
                </option>
              ))}
            </select>
          )}
          {latestVersion && (
            <span className="text-sm px-2 py-0.5 rounded bg-muted">
              v{latestVersion.versionNumber}
            </span>
          )}
          <div className="ml-auto flex gap-2 flex-wrap">
            {selectedVersion && (
              <>
                <div className="relative" ref={exportDropdownRef}>
                  <button
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    className="px-4 py-2 border rounded-lg hover:bg-muted text-sm flex items-center gap-1"
                  >
                    Export <ChevronDown className="h-4 w-4" />
                  </button>
                  {showExportDropdown && (
                    <div className="absolute top-full left-0 mt-1 py-1 bg-background border rounded-lg shadow-lg z-50 min-w-[200px]">
                      <a
                        href={`/api/packs/${pack.id}/versions/${selectedVersion.id}/export?format=docx`}
                        className="block px-4 py-2 text-sm hover:bg-muted"
                        download
                        onClick={() => setShowExportDropdown(false)}
                      >
                        Word Document
                      </a>
                      <a
                        href={`/api/packs/${pack.id}/versions/${selectedVersion.id}/export?format=csv`}
                        className="block px-4 py-2 text-sm hover:bg-muted"
                        download
                        onClick={() => setShowExportDropdown(false)}
                      >
                        CSV Spreadsheet
                      </a>
                      <a
                        href={`/api/packs/${pack.id}/versions/${selectedVersion.id}/export?format=html`}
                        className="block px-4 py-2 text-sm hover:bg-muted"
                        download
                        onClick={() => setShowExportDropdown(false)}
                      >
                        Client Pack (HTML)
                      </a>
                      <a
                        href={`/api/packs/${pack.id}/versions/${selectedVersion.id}/export?format=json`}
                        className="block px-4 py-2 text-sm hover:bg-muted"
                        download
                        onClick={() => setShowExportDropdown(false)}
                      >
                        JSON Data
                      </a>
                    </div>
                  )}
                </div>
                {(pack as { divergedFromBaseline?: boolean }).divergedFromBaseline && (
            <Link
              href={`/workspace/${workspaceId}/projects/${projectId}/packs/${pack.id}#baselines`}
              className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
            >
              Pack changed since baseline
            </Link>
          )}
          {pack.reviewStatus === "approved" && (
                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                    Pack approved
                  </span>
                )}
                {selectedVersion && (
                  <button
                    onClick={() => setShowApprovalModal(true)}
                    className="px-4 py-2 border rounded-lg hover:bg-muted text-sm"
                  >
                    Request approval
                  </button>
                )}
                {reviewLink ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Review link active
                    </span>
                    <button
                      onClick={() => {
                        if (confirm("Revoke the review link? It will no longer work.")) {
                          revokeReview.mutate({ token: reviewLink.token });
                        }
                      }}
                      disabled={revokeReview.isPending}
                      className="px-4 py-2 border rounded-lg hover:bg-red-50 text-red-600 text-sm disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      shareForReview.mutate({
                        packVersionId: selectedVersion.id,
                        expiresInDays: 7,
                      })
                    }
                    disabled={shareForReview.isPending}
                    className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
                  >
                    {shareForReview.isPending ? "..." : "Share for Review"}
                  </button>
                )}
                {selectedVersion.editLockUserId ? (
                  <button
                    onClick={() => unlockVersion.mutate({ packVersionId: selectedVersion.id })}
                    disabled={unlockVersion.isPending}
                    className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
                  >
                    Unlock
                  </button>
                ) : (
                  <button
                    onClick={() => lockVersion.mutate({ packVersionId: selectedVersion.id })}
                    disabled={lockVersion.isPending}
                    className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
                  >
                    Lock
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Create a snapshot of this version? This will create a new version with the current content.")) {
                      createSnapshot.mutate({ packVersionId: selectedVersion.id });
                    }
                  }}
                  disabled={createSnapshot.isPending}
                  className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
                >
                  {createSnapshot.isPending ? "..." : "Create Version"}
                </button>
              </>
            )}
            {newSourcesData?.hasNew && (
              <button
                onClick={() => {
                  setRefreshSourceIds(new Set(sources.map((s) => s.id)));
                  setShowRefresh(true);
                }}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
              >
                Refresh with New Sources ({newSourcesData.newCount})
              </button>
            )}
            {mondayConnection && selectedVersion && (
              <button
                onClick={() => {
                  setPushStoryIds(new Set((selectedVersion.stories ?? []).map((s) => s.id)));
                  setShowPushModal(true);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-muted text-sm"
              >
                Push to Monday.com
              </button>
            )}
            {jiraConnection && selectedVersion && (
              <button
                onClick={() => {
                  setPushStoryIds(new Set((selectedVersion.stories ?? []).map((s) => s.id)));
                  setShowPushJiraModal(true);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-muted text-sm"
              >
                Push to Jira
              </button>
            )}
            {hasExports && (
              <button
                onClick={() =>
                  triggerSync.mutate({ packId: pack.id })
                }
                disabled={triggerSync.isPending}
                className="px-4 py-2 border rounded-lg hover:bg-muted text-sm disabled:opacity-50"
              >
                {triggerSync.isPending ? "Syncing…" : "Sync now"}
              </button>
            )}
            <button
              onClick={() => setShowRegenerate(true)}
              className="px-4 py-2 border rounded-lg hover:bg-muted text-sm"
            >
              Regenerate
            </button>
          </div>
        </div>
      </header>

      {showRegenerate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-4">Regenerate Pack</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select sources and add notes. A new version will be created;
              previous versions are preserved.
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {sources.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={regenerateSourceIds.has(s.id)}
                    onChange={() => {
                      setRegenerateSourceIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.type}
                  </span>
                </label>
              ))}
            </div>
            <textarea
              placeholder="Guidance notes (optional)"
              value={regenerateNotes}
              onChange={(e) => setRegenerateNotes(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRegenerate(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (regenerateSourceIds.size > 0) {
                    regenerate.mutate({
                      packId: pack.id,
                      sourceIds: Array.from(regenerateSourceIds),
                      userNotes: regenerateNotes || undefined,
                    });
                  }
                }}
                disabled={
                  regenerate.isPending || regenerateSourceIds.size === 0
                }
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {regenerate.isPending ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRefresh && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-4">Refresh Pack with New Sources</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select all sources (including new ones). The pack will be updated with
              new evidence. Change analysis will show what changed.
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {sources.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={refreshSourceIds.has(s.id)}
                    onChange={() => {
                      setRefreshSourceIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.type}</span>
                </label>
              ))}
            </div>
            <textarea
              placeholder="Guidance notes (optional)"
              value={refreshNotes}
              onChange={(e) => setRefreshNotes(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRefresh(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (refreshSourceIds.size > 0) {
                    refresh.mutate({
                      packId: pack.id,
                      sourceIds: Array.from(refreshSourceIds),
                      userNotes: refreshNotes || undefined,
                    });
                  }
                }}
                disabled={refresh.isPending || refreshSourceIds.size === 0}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {refresh.isPending ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPushJiraModal && selectedVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-4">Push to Jira</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select stories to push. Each story becomes an issue in your Jira project.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Jira project key</label>
              <input
                type="text"
                value={pushJiraProjectKey}
                onChange={(e) => setPushJiraProjectKey(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g. PROJ"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {(selectedVersion.stories ?? []).map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={pushStoryIds.has(s.id)}
                    onChange={() => {
                      setPushStoryIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm truncate">{s.persona}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPushJiraModal(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pushStoryIds.size > 0 && pushJiraProjectKey.trim()) {
                    pushToJira.mutate({
                      packVersionId: selectedVersion.id,
                      storyIds: Array.from(pushStoryIds),
                      projectKey: pushJiraProjectKey.trim(),
                    });
                  }
                }}
                disabled={pushToJira.isPending || pushStoryIds.size === 0 || !pushJiraProjectKey.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {pushToJira.isPending ? "Pushing…" : "Push"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPushModal && selectedVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold mb-4">Push to Monday.com</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select stories to push. Each story becomes an item on your board.
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {(selectedVersion.stories ?? []).map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={pushStoryIds.has(s.id)}
                    onChange={() => {
                      setPushStoryIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-sm truncate">{s.persona}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPushModal(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (pushStoryIds.size > 0) {
                    pushToMonday.mutate({
                      packVersionId: selectedVersion.id,
                      storyIds: Array.from(pushStoryIds),
                    });
                  }
                }}
                disabled={pushToMonday.isPending || pushStoryIds.size === 0}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {pushToMonday.isPending ? "Pushing..." : "Push"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApprovalModal && selectedVersion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Request approval</h2>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Approver name</label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Approver email</label>
                <input
                  type="email"
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (approverName.trim() && approverEmail.trim()) {
                    createApproval.mutate({
                      packId: pack.id,
                      packVersionId: selectedVersion.id,
                      approverName: approverName.trim(),
                      approverEmail: approverEmail.trim(),
                    });
                  }
                }}
                disabled={
                  createApproval.isPending ||
                  !approverName.trim() ||
                  !approverEmail.trim()
                }
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {createApproval.isPending ? "Sending…" : "Send request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && shareResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-2">Share for Review</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Link copied to clipboard. Expires in 7 days.
            </p>
            <p className="text-xs font-mono bg-muted p-2 rounded break-all mb-4">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {shareResult.url}
            </p>
            <button
              onClick={() => setShowShareModal(false)}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
