import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { requireProjectRole } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";

export const changeRequestRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        status: z.enum(["open", "approved", "rejected", "implemented"]).optional(),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const where = {
        projectId: input.projectId,
        workspaceId: ctx.workspaceId,
        ...(input.status ? { status: input.status } : {}),
      };

      const [crs, total] = await Promise.all([
        db.changeRequest.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
          include: {
            pack: { select: { name: true } },
          },
        }),
        db.changeRequest.count({ where }),
      ]);

      return {
        changeRequests: crs.map((cr) => ({
          ...cr,
          impactedStoryCount: Array.isArray(cr.impactedStoryIds)
            ? (cr.impactedStoryIds as string[]).length
            : 0,
        })),
        total,
      };
    }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cr = await db.changeRequest.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        include: {
          pack: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      });
      if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "Change request not found" });
      return cr;
    }),

  create: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        packId: z.string(),
        title: z.string().min(1).max(500),
        description: z.string().min(1),
        trigger: z.string().min(1).max(500),
        triggerSourceId: z.string().optional(),
        impactedStoryIds: z.array(z.string()),
        impactSummary: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: { project: true },
      });
      if (!pack || pack.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pack not found" });
      }
      await requireProjectRole(ctx.workspaceId, ctx.userId, input.projectId, [
        "Contributor",
        "admin",
      ]);

      const cr = await db.changeRequest.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: input.projectId,
          packId: input.packId,
          title: input.title,
          description: input.description,
          trigger: input.trigger,
          triggerSourceId: input.triggerSourceId,
          impactedStoryIds: input.impactedStoryIds,
          impactSummary: input.impactSummary,
          requestedBy: ctx.userId,
          status: "open",
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "changeRequest.create",
        entityType: "ChangeRequest",
        entityId: cr.id,
      });

      return cr;
    }),

  approve: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cr = await db.changeRequest.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "Change request not found" });
      if (cr.status !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open change requests can be approved" });
      }
      await requireProjectRole(ctx.workspaceId, ctx.userId, cr.projectId, [
        "Approver",
        "admin",
      ]);

      await db.changeRequest.update({
        where: { id: input.id },
        data: {
          status: "approved",
          approvedBy: ctx.userId,
          approvedAt: new Date(),
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "changeRequest.approve",
        entityType: "ChangeRequest",
        entityId: input.id,
      });

      return { status: "approved" };
    }),

  reject: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const cr = await db.changeRequest.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "Change request not found" });
      if (cr.status !== "open") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only open change requests can be rejected" });
      }
      await requireProjectRole(ctx.workspaceId, ctx.userId, cr.projectId, [
        "Approver",
        "admin",
      ]);

      await db.changeRequest.update({
        where: { id: input.id },
        data: {
          status: "rejected",
          rejectionReason: input.reason,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "changeRequest.reject",
        entityType: "ChangeRequest",
        entityId: input.id,
        metadata: { reason: input.reason },
      });

      return { status: "rejected" };
    }),

  markImplemented: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cr = await db.changeRequest.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!cr) throw new TRPCError({ code: "NOT_FOUND", message: "Change request not found" });
      if (cr.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved change requests can be marked implemented" });
      }

      await db.changeRequest.update({
        where: { id: input.id },
        data: { status: "implemented" },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "changeRequest.markImplemented",
        entityType: "ChangeRequest",
        entityId: input.id,
      });

      return { status: "implemented" };
    }),
});
