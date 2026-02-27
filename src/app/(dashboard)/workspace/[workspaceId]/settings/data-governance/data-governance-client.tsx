"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Download, Trash2, RotateCcw, Shield } from "lucide-react";

export function DataGovernanceClient({ workspaceId }: { workspaceId: string }) {
  const [deleteConfirm, setDeleteConfirm] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: policy } = trpc.retention.getRetentionPolicy.useQuery({
    workspaceId,
  });
  const { data: summary } = trpc.retention.getDataSummary.useQuery({
    workspaceId,
  });
  const { data: projects } = trpc.retention.listProjectsWithExemption.useQuery({
    workspaceId,
  });

  const updatePolicy = trpc.retention.updateRetentionPolicy.useMutation({
    onSuccess: () => {
      utils.retention.getRetentionPolicy.invalidate({ workspaceId });
      utils.retention.getDataSummary.invalidate({ workspaceId });
    },
  });
  const exemptProject = trpc.retention.exemptProject.useMutation({
    onSuccess: () => {
      utils.retention.listProjectsWithExemption.invalidate({ workspaceId });
      utils.retention.getDataSummary.invalidate({ workspaceId });
    },
  });
  const softDelete = trpc.retention.softDeleteProject.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      utils.retention.getDataSummary.invalidate({ workspaceId });
      utils.retention.listProjectsWithExemption.invalidate({ workspaceId });
    },
  });
  const recover = trpc.retention.recoverProject.useMutation({
    onSuccess: () => {
      utils.retention.getDataSummary.invalidate({ workspaceId });
      utils.retention.listProjectsWithExemption.invalidate({ workspaceId });
    },
  });
  const exportData = trpc.retention.exportProjectData.useMutation();

  const handleExport = async (projectId: string) => {
    const result = await exportData.mutateAsync({ projectId });
    const bytes = Uint8Array.from(atob(result.downloadData), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!policy || !summary) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Data summary */}
      <section className="p-4 border rounded-lg bg-muted/30">
        <h2 className="font-semibold mb-3">Data summary</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Projects</span>
            <p className="font-medium">{summary.projectCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Sources</span>
            <p className="font-medium">{summary.sourceCount}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Retention policy</span>
            <p className="font-medium">{summary.retentionEnabled ? "Enabled" : "Disabled"}</p>
          </div>
        </div>
      </section>

      {/* Retention policy */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3">Retention policy</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={policy.retentionEnabled}
              onChange={(e) =>
                updatePolicy.mutate({
                  workspaceId,
                  retentionEnabled: e.target.checked,
                })
              }
              disabled={updatePolicy.isPending}
            />
            <span className="text-sm">Enable auto-archive and auto-delete</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Auto-archive after (days)
              </label>
              <input
                type="number"
                min={1}
                max={730}
                value={policy.retentionAutoArchiveDays}
                onChange={(e) =>
                  updatePolicy.mutate({
                    workspaceId,
                    retentionAutoArchiveDays: parseInt(e.target.value, 10) || 180,
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">
                Auto-delete after (days)
              </label>
              <input
                type="number"
                min={1}
                max={1095}
                value={policy.retentionAutoDeleteDays}
                onChange={(e) =>
                  updatePolicy.mutate({
                    workspaceId,
                    retentionAutoDeleteDays: parseInt(e.target.value, 10) || 365,
                  })
                }
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Project exemptions */}
      {projects && projects.length > 0 && (
        <section className="p-4 border rounded-lg">
          <h2 className="font-semibold mb-3">Project exemptions</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Exempt projects from retention policies (they will not be auto-archived or deleted).
          </p>
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm">{p.name}</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={p.exemptFromRetention}
                    onChange={(e) =>
                      exemptProject.mutate({
                        projectId: p.id,
                        exempt: e.target.checked,
                      })
                    }
                    disabled={exemptProject.isPending}
                  />
                  <span className="text-xs text-muted-foreground">Exempt</span>
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Export & delete per project */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3">Export & delete</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Export all project data as a SAR-ready ZIP (evidence, packs, baselines, audit log).
        </p>
        <div className="space-y-2">
          {projects?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between py-2 border-b last:border-0 gap-4"
            >
              <span className="text-sm truncate">{p.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleExport(p.id)}
                  disabled={exportData.isPending}
                  className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  onClick={() => setDeleteConfirm({ projectId: p.id, projectName: p.name })}
                  className="flex items-center gap-1 text-sm text-destructive hover:underline"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently deleted */}
      {summary.deletedProjects.length > 0 && (
        <section className="p-4 border rounded-lg border-amber-200 dark:border-amber-800">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Recently deleted
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Recover within 30 days. After that, projects are permanently removed.
          </p>
          <div className="space-y-2">
            {summary.deletedProjects.map((p) => {
              const deletedAt = p.deletedAt ? new Date(p.deletedAt) : null;
              const recoverBy = deletedAt
                ? new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
                : null;
              const canRecover = recoverBy && new Date() < recoverBy;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <span className="text-sm">{p.name}</span>
                    <p className="text-xs text-muted-foreground">
                      Deleted {deletedAt?.toLocaleDateString()}
                      {canRecover && recoverBy && (
                        <> · Recover by {recoverBy.toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  {canRecover && (
                    <button
                      onClick={() => recover.mutate({ projectId: p.id })}
                      disabled={recover.isPending}
                      className="flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Recover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">Delete project</h3>
            <p className="text-sm text-muted-foreground mb-4">
              &quot;{deleteConfirm.projectName}&quot; will be moved to Recently Deleted. You can
              recover it within 30 days. After that, it will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => softDelete.mutate({ projectId: deleteConfirm.projectId })}
                disabled={softDelete.isPending}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50"
              >
                {softDelete.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
