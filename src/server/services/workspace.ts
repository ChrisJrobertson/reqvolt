import { db } from "../db";
import { WorkspaceRole } from "@prisma/client";

export const workspaceService = {
  async listByUser(userId: string) {
    const members = await db.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
    });
    return members.map((m) => m.workspace);
  },

  async getById(workspaceId: string, validatedWorkspaceId: string) {
    if (workspaceId !== validatedWorkspaceId) {
      throw new Error("Workspace access denied");
    }
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: true },
    });
    if (!workspace) throw new Error("Workspace not found");
    return workspace;
  },

  async create(userId: string, name: string) {
    const workspace = await db.workspace.create({
      data: {
        name,
        members: {
          create: {
            userId,
            role: WorkspaceRole.Admin,
            email: "", // Will be synced from Clerk
          },
        },
      },
    });
    return workspace;
  },

  async invite(
    workspaceId: string,
    invitedBy: string,
    email: string,
    role: WorkspaceRole
  ) {
    const member = await db.workspaceMember.create({
      data: {
        workspaceId,
        userId: `invite-${email}`, // Placeholder until they accept
        email,
        role,
      },
    });
    return member;
  },

  async getOrCreatePersonalWorkspace(userId: string, email: string) {
    const existing = await db.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });
    if (existing) return existing.workspace;

    const workspace = await db.workspace.create({
      data: {
        name: "My Workspace",
        members: {
          create: {
            userId,
            role: WorkspaceRole.Admin,
            email,
          },
        },
      },
    });
    return workspace;
  },
};
