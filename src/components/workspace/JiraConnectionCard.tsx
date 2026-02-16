"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { WorkspaceRole } from "@prisma/client";

const CONNECT_URL = "/api/integrations/jira/connect";

export function JiraConnectionCard({ workspaceId }: { workspaceId: string }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const { data: member } = trpc.workspace.getCurrentMember.useQuery();
  const { data: connection, isLoading } = trpc.jira.getConnection.useQuery(
    undefined,
    { enabled: !!member }
  );
  const disconnect = trpc.jira.disconnect.useMutation({
    onSuccess: () => {
      setShowDisconnectConfirm(false);
      setDisconnecting(false);
      window.location.reload();
    },
  });
  const triggerSync = trpc.jira.triggerSync.useMutation({
    onSuccess: () => window.location.reload(),
  });

  if (!member) return null;
  if (member.role !== WorkspaceRole.Admin) return null;

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  if (connection) {
    return (
      <section className="max-w-lg space-y-4">
        <h2 className="text-lg font-semibold">Jira Cloud</h2>
        {connection.syncError && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            {connection.syncError}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Connected to {connection.siteUrl}
          {connection.lastSyncedAt && (
            <> · Last synced {new Date(connection.lastSyncedAt).toLocaleString()}</>
          )}
        </p>
        <div className="flex gap-2">
          <a
            href={`${CONNECT_URL}?workspaceId=${workspaceId}`}
            className="px-4 py-2 border rounded-lg hover:bg-muted"
          >
            Reconnect
          </a>
          <button
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            {triggerSync.isPending ? "Syncing…" : "Sync now"}
          </button>
          {showDisconnectConfirm ? (
            <>
              <button
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
              >
                Confirm disconnect
              </button>
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              disabled={disconnecting}
              className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              Disconnect
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Jira Cloud</h2>
      <p className="text-sm text-muted-foreground">
        Sync story feedback from Jira to keep packs aligned with delivery.
      </p>
      <a
        href={`${CONNECT_URL}?workspaceId=${workspaceId}`}
        className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
      >
        Connect Jira Cloud
      </a>
    </section>
  );
}
