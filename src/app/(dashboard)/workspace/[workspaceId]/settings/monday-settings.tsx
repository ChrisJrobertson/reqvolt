"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export function MondaySettings({
  workspaceId, // eslint-disable-line @typescript-eslint/no-unused-vars -- reserved for future workspace-scoped API calls
}: {
  workspaceId: string;
}) {
  const { data: connection, isLoading } = trpc.monday.getConnection.useQuery();
  const [apiToken, setApiToken] = useState("");
  const [boardId, setBoardId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [step, setStep] = useState<"token" | "board" | "group">("token");

  const listBoards = trpc.monday.listBoards.useQuery(
    { apiToken },
    { enabled: step === "board" && !!apiToken }
  );
  const listGroups = trpc.monday.listGroups.useQuery(
    { apiToken, boardId },
    { enabled: step === "group" && !!apiToken && !!boardId }
  );

  const connect = trpc.monday.connect.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const disconnect = trpc.monday.disconnect.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const handleFetchBoards = () => {
    setStep("board");
  };

  const handleSelectBoard = (id: string) => {
    setBoardId(id);
    setStep("group");
  };

  const handleConnect = () => {
    if (apiToken && boardId && groupId) {
      connect.mutate({ apiToken, boardId, groupId });
    }
  };

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  if (connection) {
    return (
      <section className="max-w-lg">
        <h2 className="text-lg font-semibold mb-2">Monday.com</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Connected. Board: {connection.boardId} • Group: {connection.groupId}
        </p>
        <button
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          {disconnect.isPending ? "Disconnecting..." : "Disconnect"}
        </button>
      </section>
    );
  }

  return (
    <section className="max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Monday.com</h2>
      <p className="text-sm text-muted-foreground">
        Connect your workspace to push Story Packs to Monday.com. You need a
        Monday.com API token from your account settings.
      </p>

      {step === "token" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">API Token</label>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="Your Monday.com API token"
            className="w-full px-4 py-2 border rounded-lg"
          />
          <button
            onClick={handleFetchBoards}
            disabled={!apiToken || listBoards.isFetching}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            {listBoards.isFetching ? "Loading..." : "Next: Select Board"}
          </button>
        </div>
      )}

      {step === "board" && listBoards.data && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Select Board</label>
          <select
            value={boardId}
            onChange={(e) => handleSelectBoard(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="">Choose a board...</option>
            {listBoards.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setStep("token")}
              className="px-4 py-2 border rounded-lg"
            >
              Back
            </button>
            <button
              onClick={() => boardId && setStep("group")}
              disabled={!boardId}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              Next: Select Group
            </button>
          </div>
        </div>
      )}

      {step === "group" && listGroups.data && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Select Group</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="">Choose a group...</option>
            {listGroups.data.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setStep("board")}
              className="px-4 py-2 border rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleConnect}
              disabled={!groupId || connect.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              {connect.isPending ? "Connecting..." : "Connect"}
            </button>
          </div>
        </div>
      )}

      {listBoards.error && (
        <p className="text-sm text-red-600">{listBoards.error.message}</p>
      )}
    </section>
  );
}
