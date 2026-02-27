"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { RefreshCw, ExternalLink } from "lucide-react";

export function IntegrationsClient({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const [selectedPackId, setSelectedPackId] = useState<string>("");

  const { data: mondayConn } = trpc.monday.getConnection.useQuery();
  const { data: jiraConn } = trpc.jira.getConnection.useQuery();
  const { data: packs } = trpc.project.getById.useQuery({ projectId });
  const { data: pushHistory } = trpc.storyExport.pushHistory.useQuery({
    projectId,
    limit: 20,
  });

  const utils = trpc.useUtils();
  const rePushChanged = trpc.storyExport.rePushChanged.useMutation({
    onSuccess: () => {
      utils.storyExport.syncStatus.invalidate({ packId: effectivePackId });
      utils.storyExport.syncMap.invalidate({ packId: effectivePackId });
      utils.storyExport.pushHistory.invalidate({ projectId });
    },
  });

  const packList = packs?.packs ?? [];
  const firstPackId = packList[0]?.id ?? "";
  const effectivePackId = selectedPackId || firstPackId;
  const { data: status } = trpc.storyExport.syncStatus.useQuery(
    { packId: effectivePackId },
    { enabled: !!effectivePackId }
  );
  const { data: map } = trpc.storyExport.syncMap.useQuery(
    { packId: effectivePackId },
    { enabled: !!effectivePackId }
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-4">Connection Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={`border rounded-lg p-4 ${
              mondayConn ? "border-green-500/50 bg-green-50/50" : "border-muted"
            }`}
          >
            <h3 className="font-medium">Monday.com</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {mondayConn
                ? `Connected · Board ${mondayConn.boardId}`
                : "Not connected"}
            </p>
            {!mondayConn && (
              <Link
                href={`/workspace/${workspaceId}/settings`}
                className="text-sm text-primary hover:underline mt-2 inline-block"
              >
                Connect in settings →
              </Link>
            )}
          </div>
          <div
            className={`border rounded-lg p-4 ${
              jiraConn?.isActive !== false ? "border-green-500/50 bg-green-50/50" : "border-muted"
            }`}
          >
            <h3 className="font-medium">Jira</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {jiraConn?.isActive !== false
                ? `Connected · ${jiraConn?.siteUrl ?? "Cloud"}`
                : "Not connected"}
            </p>
            {(!jiraConn || jiraConn.isActive === false) && (
              <Link
                href={`/workspace/${workspaceId}/settings`}
                className="text-sm text-primary hover:underline mt-2 inline-block"
              >
                Connect in settings →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Push History</h2>
        {pushHistory && pushHistory.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Pack</th>
                  <th className="text-left p-3">Target</th>
                  <th className="text-right p-3">Artefacts</th>
                  <th className="text-right p-3">Errors</th>
                </tr>
              </thead>
              <tbody>
                {pushHistory.map((h, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3 text-muted-foreground">
                      {new Date(h.date).toLocaleString()}
                    </td>
                    <td className="p-3">{h.packName}</td>
                    <td className="p-3">{h.targetSystem}</td>
                    <td className="p-3 text-right">{h.artefactCount}</td>
                    <td className="p-3 text-right text-red-600">{h.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No push history yet. Push stories from a pack to Monday.com or Jira.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Per-Pack Sync Status</h2>
        {packList.length > 0 ? (
          <>
            <div className="flex gap-2 mb-4">
              <select
                value={effectivePackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                {packList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {status && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold">{status.totalArtefacts}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Monday</p>
                  <p className="font-semibold">{status.pushedToMonday}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Jira</p>
                  <p className="font-semibold">{status.pushedToJira}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Not pushed</p>
                  <p className="font-semibold">{status.notYetPushed}</p>
                </div>
                <div className="border rounded p-3">
                  <p className="text-xs text-muted-foreground">Changed</p>
                  <p className="font-semibold text-amber-600">
                    {status.changedSincePush}
                  </p>
                </div>
              </div>
            )}

            {status && status.changedSincePush > 0 && (
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() =>
                    rePushChanged.mutate(
                      { packId: effectivePackId, target: "monday" },
                      { onSuccess: () => rePushChanged.reset() }
                    )
                  }
                  disabled={rePushChanged.isPending || !mondayConn}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-push to Monday
                </button>
                <button
                  onClick={() =>
                    rePushChanged.mutate(
                      { packId: effectivePackId, target: "jira" },
                      { onSuccess: () => rePushChanged.reset() }
                    )
                  }
                  disabled={rePushChanged.isPending || !jiraConn?.isActive}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Re-push to Jira
                </button>
              </div>
            )}

            {map && map.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <h3 className="p-3 font-medium bg-muted/50">
                  Artefact Sync Map
                </h3>
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-3">Story</th>
                      <th className="text-left p-3">Monday</th>
                      <th className="text-left p-3">Jira</th>
                      <th className="text-left p-3">Last push</th>
                      <th className="text-left p-3">Changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.map((row) => (
                      <tr key={row.storyId} className="border-t">
                        <td className="p-3">
                          <Link
                            href={`/workspace/${workspaceId}/projects/${projectId}/packs/${effectivePackId}`}
                            className="text-primary hover:underline line-clamp-1 max-w-[200px]"
                          >
                            {row.title || row.storyId.slice(-6)}
                          </Link>
                        </td>
                        <td className="p-3">
                          {row.mondayUrl ? (
                            <a
                              href={row.mondayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {row.mondayItemId}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          {row.jiraUrl ? (
                            <a
                              href={row.jiraUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {row.jiraIssueKey}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {row.lastPushDate
                            ? new Date(row.lastPushDate).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="p-3">
                          {row.changedSincePush ? (
                            <span className="text-amber-600 text-xs">
                              Yes
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            No packs yet. Create a pack to see sync status.
          </p>
        )}
      </section>
    </div>
  );
}
