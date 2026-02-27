import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { ClassificationTag, ConflictResolution } from "@prisma/client";
import { classifyChunks } from "../services/evidence-classification";
import { auditService } from "../services/audit";
import { inngest } from "../inngest/client";

const classificationTagSchema = z.nativeEnum(ClassificationTag).optional();
const conflictResolutionSchema = z.nativeEnum(ConflictResolution);

export const evidenceLedgerRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        sourceId: z.string().optional(),
        classificationTag: classificationTagSchema,
        dateRange: z
          .object({
            from: z.date(),
            to: z.date(),
          })
          .optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      const sourceWhere: {
        projectId: string;
        workspaceId: string;
        deletedAt: null;
        id?: string;
        createdAt?: { gte?: Date; lte?: Date };
      } = {
        projectId: input.projectId,
        workspaceId: ctx.workspaceId,
        deletedAt: null,
      };

      if (input.sourceId) sourceWhere.id = input.sourceId;
      if (input.dateRange) {
        sourceWhere.createdAt = {
          gte: input.dateRange.from,
          lte: input.dateRange.to,
        };
      }

      const where: {
        source: typeof sourceWhere;
        classificationTag?: ClassificationTag;
        content?: { contains: string; mode: "insensitive" };
      } = {
        source: sourceWhere,
      };

      if (input.classificationTag) where.classificationTag = input.classificationTag;
      if (input.search?.trim()) {
        where.content = {
          contains: input.search.trim(),
          mode: "insensitive",
        };
      }

      const chunks = await db.sourceChunk.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
        include: {
          source: { select: { id: true, name: true, type: true, createdAt: true } },
          _count: { select: { evidenceLinks: true } },
        },
      });

      const hasMore = chunks.length > input.limit;
      const items = hasMore ? chunks.slice(0, -1) : chunks;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      return {
        items: items.map((c) => ({
          id: c.id,
          content: c.content,
          chunkIndex: c.chunkIndex,
          classificationTag: c.classificationTag,
          classificationConfidence: c.classificationConfidence,
          sourceId: c.sourceId,
          sourceName: c.source.name,
          sourceType: c.source.type,
          sourceCreatedAt: c.source.createdAt,
          evidenceLinkCount: c._count.evidenceLinks,
          redactedAt: c.redactedAt,
        })),
        nextCursor,
      };
    }),

  stats: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      const chunks = await db.sourceChunk.findMany({
        where: {
          source: {
            projectId: input.projectId,
            workspaceId: ctx.workspaceId,
            deletedAt: null,
          },
        },
        select: { classificationTag: true },
      });

      const counts: Record<string, number> = {
        REQUIREMENT: 0,
        DECISION: 0,
        COMMITMENT: 0,
        QUESTION: 0,
        CONTEXT: 0,
        CONSTRAINT: 0,
        unclassified: 0,
      };

      for (const c of chunks) {
        if (c.classificationTag) {
          counts[c.classificationTag] = (counts[c.classificationTag] ?? 0) + 1;
        } else {
          counts.unclassified++;
        }
      }

      return { counts, total: chunks.length };
    }),

  reclassify: workspaceProcedure
    .input(z.object({ sourceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await db.source.findFirst({
        where: { id: input.sourceId, workspaceId: ctx.workspaceId },
      });
      if (!source) throw new Error("Source not found");

      const chunks = await db.sourceChunk.findMany({
        where: { sourceId: input.sourceId },
        select: { id: true, content: true },
      });

      await db.sourceChunk.updateMany({
        where: { sourceId: input.sourceId },
        data: { classificationTag: null, classificationConfidence: null },
      });

      if (chunks.length > 0) {
        await classifyChunks(
          chunks.map((c) => ({ id: c.id, content: c.content })),
          ctx.workspaceId
        );
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "evidence.reclassify",
        entityType: "Source",
        entityId: input.sourceId,
      });

      return { reclassified: chunks.length };
    }),

  conflicts: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      return db.evidenceConflict.findMany({
        where: { projectId: input.projectId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        include: {
          chunkA: {
            include: { source: { select: { name: true } } },
          },
          chunkB: {
            include: { source: { select: { name: true } } },
          },
        },
      });
    }),

  resolveConflict: workspaceProcedure
    .input(
      z.object({
        conflictId: z.string(),
        resolution: conflictResolutionSchema,
        resolutionNote: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conflict = await db.evidenceConflict.findFirst({
        where: { id: input.conflictId, workspaceId: ctx.workspaceId },
      });
      if (!conflict) throw new Error("Conflict not found");

      await db.evidenceConflict.update({
        where: { id: input.conflictId },
        data: {
          resolution: input.resolution,
          resolvedBy: ctx.userId,
          resolvedAt: new Date(),
          resolutionNote: input.resolutionNote,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "conflict.resolved",
        entityType: "EvidenceConflict",
        entityId: input.conflictId,
        metadata: { resolution: input.resolution },
      });

      return { ok: true };
    }),

  triggerConflictDetection: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      await inngest.send({
        name: "project/detect-conflicts",
        data: {
          projectId: input.projectId,
          workspaceId: ctx.workspaceId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "conflict_detection.triggered",
        entityType: "Project",
        entityId: input.projectId,
      });

      return { ok: true };
    }),
});
