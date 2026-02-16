import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";

export const sourceImpactRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        acknowledged: z.boolean().optional().default(false),
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const [impacts, total] = await Promise.all([
        db.sourceChangeImpact.findMany({
        where: {
            packId: input.packId,
            isAcknowledged: input.acknowledged === true,
          },
        orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
          include: {
            source: { select: { name: true } },
          },
        }),
        db.sourceChangeImpact.count({
          where: {
            packId: input.packId,
            isAcknowledged: input.acknowledged === true,
          },
        }),
      ]);

      return { impacts, total };
    }),

  acknowledge: workspaceProcedure
    .input(z.object({ impactId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const impact = await db.sourceChangeImpact.findFirst({
        where: { id: input.impactId },
        include: { pack: true },
      });
      if (!impact || impact.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Impact not found");
      }

      await db.sourceChangeImpact.update({
        where: { id: input.impactId },
        data: {
          isAcknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "sourceImpact.acknowledge",
        entityType: "SourceChangeImpact",
        entityId: input.impactId,
      });

      return { acknowledged: true };
    }),

  acknowledgeAll: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const result = await db.sourceChangeImpact.updateMany({
        where: { packId: input.packId, isAcknowledged: false },
        data: {
          isAcknowledged: true,
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.userId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "sourceImpact.acknowledgeAll",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { count: result.count },
      });

      return { acknowledged: result.count };
    }),
});
