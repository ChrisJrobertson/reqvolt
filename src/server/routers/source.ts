import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { SourceType } from "@prisma/client";
import { db } from "../db";
import { sourceService } from "../services/source";
import { auditService } from "../services/audit";

const sourceTypeSchema = z.nativeEnum(SourceType);

export const sourceRouter = router({
  list: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return sourceService.list(input.projectId, ctx.workspaceId);
    }),

  getById: workspaceProcedure
    .input(z.object({ sourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return sourceService.getById(input.sourceId, ctx.workspaceId);
    }),

  createText: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        type: sourceTypeSchema,
        name: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await sourceService.createText(
        ctx.workspaceId,
        input.projectId,
        input
      );
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.create",
        entityType: "Source",
        entityId: source.id,
      });
      return source;
    }),

  createEmail: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        subject: z.string(),
        body: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await sourceService.createEmail(
        ctx.workspaceId,
        input.projectId,
        input
      );
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.create",
        entityType: "Source",
        entityId: source.id,
      });
      return source;
    }),

  listVersions: workspaceProcedure
    .input(
      z.object({
        sourceId: z.string(),
        limit: z.number().min(1).max(50).optional().default(20),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const source = await db.source.findFirst({
        where: { id: input.sourceId, workspaceId: ctx.workspaceId },
      });
      if (!source) throw new Error("Source not found");

      const versions = await db.sourceVersion.findMany({
        where: { sourceId: input.sourceId },
        orderBy: { versionNumber: "desc" },
        take: input.limit,
        skip: input.offset,
      });

      const versionsWithDiffStats = await Promise.all(
        versions.map(async (v) => {
          const diffs = await db.sourceChunkDiff.findMany({
            where: { newVersionId: v.id },
            select: { diffType: true },
          });
          const added = diffs.filter((d) => d.diffType === "added").length;
          const removed = diffs.filter((d) => d.diffType === "removed").length;
          const modified = diffs.filter((d) => d.diffType === "modified").length;
          return {
            ...v,
            diffStats: { added, removed, modified },
          };
        })
      );

      return versionsWithDiffStats;
    }),

  delete: workspaceProcedure
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await sourceService.softDelete(input.sourceId, ctx.workspaceId);
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.delete",
        entityType: "Source",
        entityId: input.sourceId,
      });
    }),
});
