"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const ROLES = [
  { value: "Viewer", label: "Viewer", desc: "Read only" },
  { value: "Contributor", label: "Contributor", desc: "Can edit" },
  { value: "Reviewer", label: "Reviewer", desc: "Can comment" },
  { value: "Approver", label: "Approver", desc: "Can approve" },
] as const;

export function ProjectTeamClient({
  workspaceId: _workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  void _workspaceId;
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"Viewer" | "Contributor" | "Reviewer" | "Approver">("Viewer");

  const { data: members, refetch } = trpc.projectMember.list.useQuery({
    projectId,
  });
  const { data: workspaceMembers } = trpc.workspace.getMembers.useQuery();
  const assign = trpc.projectMember.assign.useMutation({
    onSuccess: () => {
      refetch();
      setShowAdd(false);
      setAddUserId("");
    },
  });
  const updateRole = trpc.projectMember.updateRole.useMutation({
    onSuccess: () => refetch(),
  });
  const remove = trpc.projectMember.remove.useMutation({
    onSuccess: () => refetch(),
  });

  const projectMemberIds = new Set(members?.map((m) => m.userId) ?? []);
  const availableToAdd =
    workspaceMembers?.filter((wm) => !projectMemberIds.has(wm.userId)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Members</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
        >
          Add Member
        </button>
      </div>

      {members && members.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        updateRole.mutate({
                          projectId,
                          userId: m.userId,
                          role: e.target.value as "Viewer" | "Contributor" | "Reviewer" | "Approver",
                        })
                      }
                      disabled={updateRole.isPending}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() =>
                        remove.mutate({ projectId, userId: m.userId })
                      }
                      disabled={remove.isPending}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No project members yet. Workspace members have Viewer access by
          default. Add members to assign specific roles.
        </p>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg p-6 max-w-md w-full">
            <h3 className="font-semibold mb-4">Add Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Workspace member</label>
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select...</option>
                  {availableToAdd.map((wm) => (
                    <option key={wm.userId} value={wm.userId}>
                      {wm.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Role</label>
                <select
                  value={addRole}
                  onChange={(e) =>
                    setAddRole(
                      e.target.value as "Viewer" | "Contributor" | "Reviewer" | "Approver"
                    )
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() =>
                  assign.mutate({
                    projectId,
                    userId: addUserId,
                    role: addRole,
                  })
                }
                disabled={!addUserId || assign.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddUserId("");
                }}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
