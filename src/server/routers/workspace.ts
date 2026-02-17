import { z } from "zod";
import { router, workspaceProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { WorkspaceRole } from "@prisma/client";
import { db } from "../db";
import { workspaceService } from "../services/workspace";
import { auditService } from "../services/audit";
import { invalidateAIControlsCache } from "@/lib/ai/model-router";

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

  getAIProcessingControls: workspaceProcedure.query(async ({ ctx }) => {
    const workspace = await db.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: {
        aiGenerationEnabled: true,
        aiQaAutoFixEnabled: true,
        aiSelfReviewEnabled: true,
        aiTopicExtractionEnabled: true,
        aiEmbeddingEnabled: true,
      },
    });
    if (!workspace) throw new Error("Workspace not found");
    return workspace;
  }),

  updateAIProcessingControls: adminProcedure
    .input(
      z.object({
        controls: z.object({
          aiGenerationEnabled: z.boolean(),
          aiQaAutoFixEnabled: z.boolean(),
          aiSelfReviewEnabled: z.boolean(),
          aiTopicExtractionEnabled: z.boolean(),
          aiEmbeddingEnabled: z.boolean(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const before = await db.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: {
          aiGenerationEnabled: true,
          aiQaAutoFixEnabled: true,
          aiSelfReviewEnabled: true,
          aiTopicExtractionEnabled: true,
          aiEmbeddingEnabled: true,
        },
      });
      if (!before) throw new Error("Workspace not found");

      const updated = await db.workspace.update({
        where: { id: ctx.workspaceId },
        data: input.controls,
        select: {
          aiGenerationEnabled: true,
          aiQaAutoFixEnabled: true,
          aiSelfReviewEnabled: true,
          aiTopicExtractionEnabled: true,
          aiEmbeddingEnabled: true,
        },
      });

      await invalidateAIControlsCache(ctx.workspaceId);

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "ai_control_changed",
        entityType: "Workspace",
        entityId: ctx.workspaceId,
        metadata: { before, after: updated },
      });

      return updated;
    }),
});
