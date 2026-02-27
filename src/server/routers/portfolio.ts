import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { getPortfolioMetrics } from "../services/portfolio-analytics";

export const portfolioRouter = router({
  metrics: workspaceProcedure
    .input(
      z.object({
        dateRange: z
          .object({
            from: z.date(),
            to: z.date(),
          })
          .optional(),
        projectIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getPortfolioMetrics(ctx.workspaceId, input.dateRange);
    }),

  projectBreakdown: workspaceProcedure.query(async ({ ctx }) => {
    const projects = await db.project.findMany({
      where: { workspaceId: ctx.workspaceId, deletedAt: null },
      include: {
        packs: {
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1,
              include: {
                stories: { where: { deletedAt: null }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    const evidenceLinks = await db.evidenceLink.findMany({
      where: {
        entityType: "story",
        sourceChunk: { source: { workspaceId: ctx.workspaceId } },
      },
      select: { entityId: true },
    });
    const storyIdsWithEvidence = new Set(evidenceLinks.map((e) => e.entityId));

    const qaFlags = await db.qAFlag.findMany({
      where: { packVersion: { pack: { workspaceId: ctx.workspaceId } } },
      select: { entityId: true },
    });
    const storyIdsWithQaFail = new Set(qaFlags.map((f) => f.entityId));

    const lastBaselines = await db.baseline.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { packId: true, createdAt: true },
    });
    const lastBaselineByPack = new Map(
      lastBaselines
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((b) => [b.packId, b.createdAt])
    );

    const storyExports = await db.storyExport.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { packId: true, lastSyncedAt: true },
    });
    const lastPushByPack = new Map<string, Date>();
    for (const se of storyExports) {
      if (se.lastSyncedAt) {
        const existing = lastPushByPack.get(se.packId);
        if (!existing || se.lastSyncedAt > existing) {
          lastPushByPack.set(se.packId, se.lastSyncedAt);
        }
      }
    }

    return projects.map((p) => {
      let totalStories = 0;
      let withEvidence = 0;
      let withQaFail = 0;
      let lastBaseline: Date | null = null;
      let lastPush: Date | null = null;

      for (const pack of p.packs) {
        const version = pack.versions[0];
        if (!version) continue;
        const storyIds = version.stories.map((s) => s.id);
        totalStories += storyIds.length;
        withEvidence += storyIds.filter((id) => storyIdsWithEvidence.has(id)).length;
        withQaFail += storyIds.filter((id) => storyIdsWithQaFail.has(id)).length;
        const lb = lastBaselineByPack.get(pack.id);
        if (lb && (!lastBaseline || lb > lastBaseline)) lastBaseline = lb;
        const lp = lastPushByPack.get(pack.id);
        if (lp && (!lastPush || lp > lastPush)) lastPush = lp;
      }

      const evidenceCoverage =
        totalStories > 0 ? Math.round((withEvidence / totalStories) * 100) : 0;
      const qaPassRate =
        totalStories > 0 ? Math.round(((totalStories - withQaFail) / totalStories) * 100) : 100;

      return {
        projectId: p.id,
        projectName: p.name,
        packCount: p.packs.length,
        evidenceCoverage,
        qaPassRate,
        lastBaselineDate: lastBaseline,
        lastPushDate: lastPush,
      };
    });
  }),
});
