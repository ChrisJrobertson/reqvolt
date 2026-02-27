import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { WorkspaceRole } from "@prisma/client";
import { db } from "../db";
import { auditService } from "../services/audit";
import { generateComplianceExport } from "../services/compliance-export";

export const complianceRouter = router({
  setLegalHold: workspaceProcedure
    .input(z.object({ projectId: z.string(), legalHold: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      await db.project.update({
        where: { id: input.projectId },
        data: {
          legalHold: input.legalHold,
          legalHoldSetBy: input.legalHold ? ctx.userId : null,
          legalHoldSetAt: input.legalHold ? new Date() : null,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: input.legalHold ? "legal_hold_set" : "legal_hold_removed",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name },
      });

      return { ok: true };
    }),

  removeLegalHold: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      await db.project.update({
        where: { id: input.projectId },
        data: {
          legalHold: false,
          legalHoldSetBy: null,
          legalHoldSetAt: null,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "legal_hold_removed",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { projectName: project.name },
      });

      return { ok: true };
    }),

  generateComplianceExport: workspaceProcedure.mutation(async ({ ctx }) => {
    if (ctx.member.role !== WorkspaceRole.Admin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
    }

    const buffer = await generateComplianceExport(ctx.workspaceId);

    await auditService.log({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "compliance_export_generated",
      entityType: "Workspace",
      entityId: ctx.workspaceId,
      metadata: { sizeBytes: buffer.length },
    });

    return {
      downloadData: buffer.toString("base64"),
      filename: `reqvolt-compliance-export-${new Date().toISOString().slice(0, 10)}.zip`,
    };
  }),

  listProjectsForLegalHold: workspaceProcedure.query(async ({ ctx }) => {
    return db.project.findMany({
      where: { workspaceId: ctx.workspaceId, deletedAt: null },
      select: { id: true, name: true, legalHold: true, legalHoldSetAt: true },
      orderBy: { name: "asc" },
    });
  }),

  getComplianceStatus: workspaceProcedure.query(async ({ ctx }) => {
    const [legalHoldProjects, workspace, lastExport] = await Promise.all([
      db.project.findMany({
        where: { workspaceId: ctx.workspaceId, legalHold: true, deletedAt: null },
        select: { id: true, name: true, legalHoldSetAt: true },
      }),
      db.workspace.findFirst({
        where: { id: ctx.workspaceId },
        select: {
          retentionEnabled: true,
          retentionAutoArchiveDays: true,
          retentionAutoDeleteDays: true,
          sessionTimeoutHours: true,
          dataRegion: true,
          ssoEnabled: true,
          ssoProvider: true,
        },
      }),
      db.auditLog.findFirst({
        where: { workspaceId: ctx.workspaceId, action: "compliance_export_generated" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    return {
      legalHolds: legalHoldProjects,
      retentionPolicy: workspace
        ? {
            enabled: workspace.retentionEnabled,
            autoArchiveDays: workspace.retentionAutoArchiveDays,
            autoDeleteDays: workspace.retentionAutoDeleteDays,
          }
        : null,
      ssoStatus: workspace?.ssoEnabled ? "configured" : "not_configured",
      sessionTimeout: workspace?.sessionTimeoutHours ?? 8,
      dataRegion: workspace?.dataRegion ?? "eu-west-1",
      lastComplianceExport: lastExport?.createdAt ?? null,
    };
  }),
});
