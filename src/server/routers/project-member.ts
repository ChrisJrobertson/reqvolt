import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { WorkspaceRole } from "@prisma/client";
import { getProjectRole } from "../trpc";

export const projectMemberRouter = router({
  getMyRole: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) return null;
      return getProjectRole(ctx.workspaceId, ctx.userId, input.projectId);
    }),

  list: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const members = await db.projectMember.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "asc" },
      });

      const workspaceMembers = await db.workspaceMember.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { userId: true, email: true, role: true },
      });
      const wsByUser = new Map(workspaceMembers.map((m) => [m.userId, m]));

      return members.map((m) => ({
        ...m,
        email: wsByUser.get(m.userId)?.email ?? "—",
        workspaceRole: wsByUser.get(m.userId)?.role ?? null,
      }));
    }),

  assign: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        role: z.enum(["Contributor", "Reviewer", "Viewer", "Approver"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wsMember = await db.workspaceMember.findFirst({
        where: { workspaceId: ctx.workspaceId },
      });
      if (wsMember?.role !== WorkspaceRole.Admin) {
        const pm = await db.projectMember.findFirst({
          where: { projectId: input.projectId, userId: ctx.userId },
        });
        if (!pm || pm.role !== "Approver") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace Admin or project Approver can assign members",
          });
        }
      }

      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const targetInWorkspace = await db.workspaceMember.findFirst({
        where: { workspaceId: ctx.workspaceId, userId: input.userId },
      });
      if (!targetInWorkspace) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User must be a workspace member first",
        });
      }

      const member = await db.projectMember.upsert({
        where: {
          projectId_userId: { projectId: input.projectId, userId: input.userId },
        },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          role: input.role as "Contributor" | "Reviewer" | "Viewer" | "Approver",
          assignedBy: ctx.userId,
        },
        update: {
          role: input.role as "Contributor" | "Reviewer" | "Viewer" | "Approver",
          assignedBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "projectMember.assign",
        entityType: "ProjectMember",
        entityId: member.id,
        metadata: { projectId: input.projectId, userId: input.userId, role: input.role },
      });

      return member;
    }),

  updateRole: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        userId: z.string(),
        role: z.enum(["Contributor", "Reviewer", "Viewer", "Approver"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wsMember = await db.workspaceMember.findFirst({
        where: { workspaceId: ctx.workspaceId },
      });
      if (wsMember?.role !== WorkspaceRole.Admin) {
        const pm = await db.projectMember.findFirst({
          where: { projectId: input.projectId, userId: ctx.userId },
        });
        if (!pm || pm.role !== "Approver") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace Admin or project Approver can update roles",
          });
        }
      }

      const member = await db.projectMember.update({
        where: {
          projectId_userId: { projectId: input.projectId, userId: input.userId },
        },
        data: {
          role: input.role as "Contributor" | "Reviewer" | "Viewer" | "Approver",
          assignedBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "projectMember.updateRole",
        entityType: "ProjectMember",
        entityId: member.id,
        metadata: { projectId: input.projectId, userId: input.userId, role: input.role },
      });

      return member;
    }),

  remove: workspaceProcedure
    .input(z.object({ projectId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const wsMember = await db.workspaceMember.findFirst({
        where: { workspaceId: ctx.workspaceId },
      });
      if (wsMember?.role !== WorkspaceRole.Admin) {
        const pm = await db.projectMember.findFirst({
          where: { projectId: input.projectId, userId: ctx.userId },
        });
        if (!pm || pm.role !== "Approver") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace Admin or project Approver can remove members",
          });
        }
      }

      await db.projectMember.delete({
        where: {
          projectId_userId: { projectId: input.projectId, userId: input.userId },
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "projectMember.remove",
        entityType: "ProjectMember",
        entityId: input.userId,
        metadata: { projectId: input.projectId },
      });

      return { removed: true };
    }),
});
