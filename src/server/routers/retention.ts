import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { WorkspaceRole } from "@prisma/client";
import { db } from "../db";
import { auditService } from "../services/audit";
import { assertNoLegalHoldForSource, assertNoLegalHoldForChunk } from "../lib/legal-hold";
import {
  softDeleteProject as svcSoftDelete,
  recoverProject as svcRecover,
  redactEvidence as svcRedact,
  exportAllProjectData,
} from "../services/retention";

export const retentionRouter = router({
  getRetentionPolicy: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "NOT_FOUND" });
      const w = await db.workspace.findFirst({
        where: { id: input.workspaceId },
        select: {
          retentionEnabled: true,
          retentionAutoArchiveDays: true,
          retentionAutoDeleteDays: true,
        },
      });
      if (!w) throw new TRPCError({ code: "NOT_FOUND" });
      return w;
    }),

  updateRetentionPolicy: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        retentionEnabled: z.boolean().optional(),
        retentionAutoArchiveDays: z.number().int().min(1).max(730).optional(),
        retentionAutoDeleteDays: z.number().int().min(1).max(1095).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      const data = {
        ...(input.retentionEnabled !== undefined && { retentionEnabled: input.retentionEnabled }),
        ...(input.retentionAutoArchiveDays !== undefined && {
          retentionAutoArchiveDays: input.retentionAutoArchiveDays,
        }),
        ...(input.retentionAutoDeleteDays !== undefined && {
          retentionAutoDeleteDays: input.retentionAutoDeleteDays,
        }),
      };
      await db.workspace.update({
        where: { id: input.workspaceId },
        data,
      });
      await auditService.log({
        workspaceId: input.workspaceId,
        userId: ctx.userId,
        action: "retention_policy_updated",
        entityType: "Workspace",
        entityId: input.workspaceId,
        metadata: data,
      });
      return { ok: true };
    }),

  softDeleteProject: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      await svcSoftDelete(input.projectId);
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project_soft_deleted",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name },
      });
      return { ok: true };
    }),

  recoverProject: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      const ok = await svcRecover(input.projectId);
      if (!ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recovery window (30 days) has expired",
        });
      }
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project_recovered",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name },
      });
      return { ok: true };
    }),

  purgeSource: workspaceProcedure
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await db.source.findFirst({
        where: { id: input.sourceId, workspaceId: ctx.workspaceId },
        include: { _count: { select: { chunks: true } } },
      });
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      await assertNoLegalHoldForSource(input.sourceId);
      await db.source.delete({ where: { id: input.sourceId } });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source_purged",
        entityType: "Source",
        entityId: input.sourceId,
        metadata: { sourceName: source.name, chunkCount: source._count.chunks },
      });
      return { ok: true };
    }),

  redactEvidence: workspaceProcedure
    .input(z.object({ chunkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const chunk = await db.sourceChunk.findFirst({
        where: { id: input.chunkId, source: { workspaceId: ctx.workspaceId } },
        include: { source: { select: { projectId: true } } },
      });
      if (!chunk) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      await assertNoLegalHoldForChunk(input.chunkId);
      await svcRedact(input.chunkId, ctx.userId);
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "evidence_redacted",
        entityType: "SourceChunk",
        entityId: input.chunkId,
      });
      return { ok: true };
    }),

  exportProjectData: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      const buffer = await exportAllProjectData(input.projectId, ctx.workspaceId);
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project_data_exported",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name, sizeBytes: buffer.length },
      });
      return {
        downloadData: buffer.toString("base64"),
        filename: `reqvolt-export-${project.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.zip`,
      };
    }),

  exemptProject: workspaceProcedure
    .input(z.object({ projectId: z.string(), exempt: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      await db.project.update({
        where: { id: input.projectId },
        data: { exemptFromRetention: input.exempt },
      });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project_exemption_toggled",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name, exempt: input.exempt },
      });
      return { ok: true };
    }),

  getDataSummary: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "NOT_FOUND" });
      const [projectCount, sourceCount, deletedProjects] = await Promise.all([
        db.project.count({ where: { workspaceId: ctx.workspaceId, deletedAt: null } }),
        db.source.count({
          where: { workspaceId: ctx.workspaceId, deletedAt: null },
        }),
        db.project.findMany({
          where: { workspaceId: ctx.workspaceId, deletedAt: { not: null } },
          select: {
            id: true,
            name: true,
            deletedAt: true,
            exemptFromRetention: true,
          },
        }),
      ]);
      const ws = await db.workspace.findFirst({
        where: { id: ctx.workspaceId },
        select: {
          retentionEnabled: true,
          retentionAutoArchiveDays: true,
          retentionAutoDeleteDays: true,
        },
      });
      return {
        projectCount,
        sourceCount,
        deletedProjects,
        retentionEnabled: ws?.retentionEnabled ?? false,
        retentionAutoArchiveDays: ws?.retentionAutoArchiveDays ?? 180,
        retentionAutoDeleteDays: ws?.retentionAutoDeleteDays ?? 365,
      };
    }),

  listProjectsWithExemption: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "NOT_FOUND" });
      return db.project.findMany({
        where: { workspaceId: ctx.workspaceId, deletedAt: null },
        select: {
          id: true,
          name: true,
          exemptFromRetention: true,
          archivedAt: true,
        },
      });
    }),
});
