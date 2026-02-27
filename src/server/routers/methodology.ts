import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import { WorkspaceRole } from "@prisma/client";
import { db } from "../db";
import { auditService } from "../services/audit";
import { BUILT_IN_PRESETS } from "../methodology/defaults";
import type { MethodologyConfigJson } from "../methodology/types";

export const methodologyRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    let configs = await db.methodologyConfig.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { name: "asc" },
    });

    if (configs.length === 0) {
      for (const preset of BUILT_IN_PRESETS) {
        await db.methodologyConfig.create({
          data: {
            workspaceId: ctx.workspaceId,
            name: preset.name,
            isBuiltIn: true,
            config: preset.config as object,
          },
        });
      }
      configs = await db.methodologyConfig.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { name: "asc" },
      });
    }

    return configs.map((c) => ({
      id: c.id,
      name: c.name,
      isBuiltIn: c.isBuiltIn,
      config: c.config as unknown as MethodologyConfigJson,
    }));
  }),

  getProjectMethodology: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
        include: { methodology: true },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });
      if (!project.methodology) return null;
      return {
        id: project.methodology.id,
        name: project.methodology.name,
        isBuiltIn: project.methodology.isBuiltIn,
        config: project.methodology.config as unknown as MethodologyConfigJson,
      };
    }),

  setProjectMethodology: workspaceProcedure
    .input(z.object({ projectId: z.string(), methodologyId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.methodologyId) {
        const methodology = await db.methodologyConfig.findFirst({
          where: { id: input.methodologyId, workspaceId: ctx.workspaceId },
        });
        if (!methodology) throw new TRPCError({ code: "NOT_FOUND" });
      }

      await db.project.update({
        where: { id: input.projectId },
        data: { methodologyId: input.methodologyId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project_methodology_set",
        entityType: "Project",
        entityId: input.projectId,
        metadata: { methodologyId: input.methodologyId },
      });

      return { ok: true };
    }),

  createCustom: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        config: z.object({
          artefactTypes: z.array(
            z.object({ key: z.string(), label: z.string(), enabled: z.boolean() })
          ),
          terminology: z.object({
            pack: z.string(),
            baseline: z.string(),
            sprint: z.string(),
          }),
          qaRuleOverrides: z.record(z.string(), z.object({ enabled: z.boolean() })),
          baselineLabelFormat: z.string(),
          workflowStages: z.array(z.string()),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin required" });
      }

      const existing = await db.methodologyConfig.findFirst({
        where: { workspaceId: ctx.workspaceId, name: input.name },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Methodology "${input.name}" already exists`,
        });
      }

      const methodology = await db.methodologyConfig.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          isBuiltIn: false,
          config: input.config as object,
          createdBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "methodology_created",
        entityType: "MethodologyConfig",
        entityId: methodology.id,
        metadata: { name: input.name },
      });

      return methodology;
    }),

  exportMethodology: workspaceProcedure
    .input(z.object({ methodologyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const methodology = await db.methodologyConfig.findFirst({
        where: { id: input.methodologyId, workspaceId: ctx.workspaceId },
      });
      if (!methodology) throw new TRPCError({ code: "NOT_FOUND" });
      return methodology.config as unknown as MethodologyConfigJson;
    }),

  importMethodology: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        config: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.member.role !== WorkspaceRole.Admin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin required" });
      }

      const config = input.config as unknown as MethodologyConfigJson;
      const methodology = await db.methodologyConfig.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          isBuiltIn: false,
          config: config as unknown as object,
          createdBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "methodology_imported",
        entityType: "MethodologyConfig",
        entityId: methodology.id,
        metadata: { name: input.name },
      });

      return methodology;
    }),
});
