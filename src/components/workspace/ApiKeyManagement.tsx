"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { WorkspaceRole } from "@prisma/client";

export function ApiKeyManagement() {
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: member } = trpc.workspace.getCurrentMember.useQuery();
  const { data: keys, isLoading } = trpc.apiKey.list.useQuery(undefined, {
    enabled: member?.role === WorkspaceRole.Admin,
  });

  const createKey = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      utils.apiKey.list.invalidate();
    },
  });

  const revokeKey = trpc.apiKey.revoke.useMutation({
    onSuccess: () => {
      setRevokingId(null);
      utils.apiKey.list.invalidate();
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    createKey.mutate({ name: newKeyName.trim() });
  };

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
    }
  };

  if (!member) return <p className="text-muted-foreground">Loading...</p>;
  if (member.role !== WorkspaceRole.Admin) return null;

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <section className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">API keys</h2>
      <p className="text-sm text-muted-foreground">
        Create API keys to authenticate the public ingest API (e.g. Zapier,
        Webhooks). Only workspace admins can create or revoke keys.
      </p>

      {createdKey && (
        <div className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
          <p className="text-sm font-medium text-amber-800 mb-2">
            Copy your key now. It won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white border rounded text-sm truncate">
              {createdKey}
            </code>
            <button
              onClick={handleCopyKey}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-amber-100"
            >
              Copy
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {!createdKey && (
        <>
          {showCreate ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. Zapier)"
                className="flex-1 px-3 py-2 border rounded-lg"
              />
              <button
                onClick={handleCreate}
                disabled={!newKeyName.trim() || createKey.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                {createKey.isPending ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewKeyName("");
                }}
                className="px-4 py-2 border rounded-lg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Create API key
            </button>
          )}
        </>
      )}

      {keys && keys.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Prefix</th>
                <th className="text-left p-3">Last used</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="p-3">{k.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">
                    {k.keyPrefix}...
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="p-3 text-right">
                    {revokingId === k.id ? (
                      <>
                        <button
                          onClick={() => revokeKey.mutate({ apiKeyId: k.id })}
                          disabled={revokeKey.isPending}
                          className="text-red-600 hover:underline mr-2"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setRevokingId(null)}
                          className="text-muted-foreground hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setRevokingId(k.id)}
                        className="text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {keys && keys.length === 0 && !createdKey && (
        <p className="text-sm text-muted-foreground">
          No API keys yet. Create one to use the ingest API.
        </p>
      )}
    </section>
  );
}
