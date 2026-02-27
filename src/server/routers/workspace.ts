import { z } from "zod";
import { router, workspaceProcedure, protectedProcedure } from "../trpc";
import { WorkspaceRole } from "@prisma/client";
import { db } from "../db";
import { workspaceService } from "../services/workspace";
import { auditService } from "../services/audit";

export const workspaceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return workspaceService.listByUser(ctx.userId);
  }),

  getById: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return workspaceService.getById(input.workspaceId, ctx.workspaceId);
    }),

  getCurrentMember: workspaceProcedure.query(async ({ ctx }) => {
    return { role: ctx.member.role };
  }),

  getMembers: workspaceProcedure.query(async ({ ctx }) => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { userId: true, email: true, role: true },
    });
    return members;
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const workspace = await workspaceService.create(ctx.userId, input.name);
      await auditService.log({
        workspaceId: workspace.id,
        userId: ctx.userId,
        action: "workspace.create",
        entityType: "Workspace",
        entityId: workspace.id,
      });
      return workspace;
    }),

  getAIProcessingControls: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new Error("Workspace not found");
      const w = await db.workspace.findFirst({
        where: { id: input.workspaceId },
        select: {
          aiGenerationEnabled: true,
          aiQaAutoFixEnabled: true,
          aiSelfReviewEnabled: true,
          aiTopicExtractionEnabled: true,
          aiEmbeddingEnabled: true,
        },
      });
      if (!w) throw new Error("Workspace not found");
      return w;
    }),

  updateAIProcessingControls: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        controls: z.object({
          aiGenerationEnabled: z.boolean().optional(),
          aiQaAutoFixEnabled: z.boolean().optional(),
          aiSelfReviewEnabled: z.boolean().optional(),
          aiTopicExtractionEnabled: z.boolean().optional(),
          aiEmbeddingEnabled: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new Error("Workspace not found");
      const w = await db.workspace.findFirst({
        where: { id: input.workspaceId },
      });
      if (!w) throw new Error("Workspace not found");
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new Error("Admin role required");
      }
      const prev = {
        aiGenerationEnabled: w.aiGenerationEnabled,
        aiQaAutoFixEnabled: w.aiQaAutoFixEnabled,
        aiSelfReviewEnabled: w.aiSelfReviewEnabled,
        aiTopicExtractionEnabled: w.aiTopicExtractionEnabled,
        aiEmbeddingEnabled: w.aiEmbeddingEnabled,
      };
      const next = { ...prev, ...input.controls };
      await db.workspace.update({
        where: { id: input.workspaceId },
        data: next,
      });
      await auditService.log({
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        action: "ai_control_changed",
        entityType: "Workspace",
        entityId: input.workspaceId,
        metadata: { before: prev, after: next },
      });
      return next;
    }),

  invite: workspaceProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.nativeEnum(WorkspaceRole),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await workspaceService.invite(
        ctx.workspaceId,
        ctx.userId,
        input.email,
        input.role
      );
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "workspace.invite",
        entityType: "WorkspaceMember",
        entityId: member.id,
        metadata: { email: input.email, role: input.role } as const,
      });
      return member;
    }),
});
