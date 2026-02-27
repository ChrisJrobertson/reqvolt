"use client";

import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { Shield, Download, Lock, Clock, Globe, Key } from "lucide-react";

export function CompliancePageClient({ workspaceId }: { workspaceId: string }) {
  const { data: status, isLoading } = trpc.compliance.getComplianceStatus.useQuery();
  const { data: projects } = trpc.compliance.listProjectsForLegalHold.useQuery();
  const utils = trpc.useUtils();
  const exportMutation = trpc.compliance.generateComplianceExport.useMutation();
  const setLegalHold = trpc.compliance.setLegalHold.useMutation({
    onSuccess: () => {
      utils.compliance.getComplianceStatus.invalidate();
      utils.compliance.listProjectsForLegalHold.invalidate();
    },
  });

  const handleExport = async () => {
    const result = await exportMutation.mutateAsync();
    const bytes = Uint8Array.from(atob(result.downloadData), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !status) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Retention policy */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Retention policy
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Status</span>
            <p className="font-medium">{status.retentionPolicy?.enabled ? "Enabled" : "Disabled"}</p>
          </div>
          {status.retentionPolicy?.enabled && (
            <>
              <div>
                <span className="text-muted-foreground">Auto-archive (days)</span>
                <p className="font-medium">{status.retentionPolicy.autoArchiveDays}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Auto-delete (days)</span>
                <p className="font-medium">{status.retentionPolicy.autoDeleteDays}</p>
              </div>
            </>
          )}
        </div>
        <Link
          href={`/workspace/${workspaceId}/settings/data-governance`}
          className="text-sm text-primary hover:underline mt-2 inline-block"
        >
          Configure →
        </Link>
      </section>

      {/* Legal holds */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Legal holds
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          When enabled, prevents deletion and modification of sources, baselines, and evidence.
        </p>
        {projects && projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center py-2 border-b last:border-0"
              >
                <span className="text-sm">{p.name}</span>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={p.legalHold}
                    onChange={(e) =>
                      setLegalHold.mutate({ projectId: p.id, legalHold: e.target.checked })
                    }
                    disabled={setLegalHold.isPending}
                  />
                  <span className="text-xs text-muted-foreground">Legal hold</span>
                </label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No projects</p>
        )}
      </section>

      {/* Session timeout */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Session timeout
        </h2>
        <p className="text-sm">
          {status.sessionTimeout} hours (managed by Clerk)
        </p>
      </section>

      {/* Data region */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Data region
        </h2>
        <p className="text-sm">{status.dataRegion}</p>
      </section>

      {/* SSO */}
      <section className="p-4 border rounded-lg border-amber-200 dark:border-amber-800">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Key className="h-4 w-4" />
          Single Sign-On
        </h2>
        <p className="text-sm text-muted-foreground mb-2">
          {status.ssoStatus === "configured" ? "Configured" : "Not configured"}
        </p>
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded text-sm">
          Coming soon — contact sales@synqforge.com
        </div>
      </section>

      {/* Compliance export */}
      <section className="p-4 border rounded-lg">
        <h2 className="font-semibold mb-3">Compliance export</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download a complete workspace export (audit log, access records, approval records,
          retention policy, all project data) with SHA-256 hashes for integrity verification.
        </p>
        <div className="flex items-center gap-4">
          {status.lastComplianceExport && (
            <p className="text-sm text-muted-foreground">
              Last export: {status.lastComplianceExport.toLocaleDateString()}
            </p>
          )}
          <button
            onClick={() => handleExport()}
            disabled={exportMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? "Generating…" : "Export now"}
          </button>
        </div>
      </section>
    </div>
  );
}
