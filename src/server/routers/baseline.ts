import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { requireProjectRole } from "../trpc";
import { db } from "../db";
import { createBaseline, compareBaselines } from "../services/baseline";
import { auditService } from "../services/audit";

export const baselineRouter = router({
  list: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      return db.baseline.findMany({
        where: { packId: input.packId, workspaceId: ctx.workspaceId },
        orderBy: { versionNumber: "desc" },
      });
    }),

  getSnapshot: workspaceProcedure
    .input(z.object({ baselineId: z.string() }))
    .query(async ({ ctx, input }) => {
      const baseline = await db.baseline.findFirst({
        where: { id: input.baselineId, workspaceId: ctx.workspaceId },
      });
      if (!baseline) throw new Error("Baseline not found");
      return { snapshotData: baseline.snapshotData, versionLabel: baseline.versionLabel };
    }),

  create: workspaceProcedure
    .input(z.object({ packId: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");
      if (pack.reviewStatus !== "approved") {
        throw new Error("Pack must be approved before creating a baseline");
      }
      await requireProjectRole(ctx.workspaceId, ctx.userId, pack.projectId, [
        "Contributor",
        "admin",
      ]);

      const baseline = await createBaseline(
        input.packId,
        ctx.workspaceId,
        ctx.userId,
        input.note
      );

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "baseline.created",
        entityType: "Baseline",
        entityId: baseline.id,
        metadata: { packId: input.packId, versionLabel: baseline.versionLabel },
      });

      return baseline;
    }),

  compare: workspaceProcedure
    .input(
      z.object({
        baselineAId: z.string(),
        baselineBId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [a, b] = await Promise.all([
        db.baseline.findFirst({
          where: { id: input.baselineAId, workspaceId: ctx.workspaceId },
        }),
        db.baseline.findFirst({
          where: { id: input.baselineBId, workspaceId: ctx.workspaceId },
        }),
      ]);
      if (!a || !b) throw new Error("Baseline not found");
      return compareBaselines(input.baselineAId, input.baselineBId);
    }),
});
