import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { getCached, setCached, dashboardCacheKey } from "../cache/dashboard";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

export const dashboardRouter = router({
  getStats: workspaceProcedure.query(async ({ ctx }) => {
    const cacheKey = dashboardCacheKey(ctx.workspaceId, "stats");
    const cached = await getCached<Awaited<ReturnType<typeof computeStats>>>(cacheKey);
    if (cached) return cached;

    const stats = await computeStats(ctx.workspaceId);
    await setCached(cacheKey, stats);
    return stats;
  }),

  getRecentActivity: workspaceProcedure.query(async ({ ctx }) => {
    const cacheKey = dashboardCacheKey(ctx.workspaceId, "activity");
    const cached = await getCached<Awaited<ReturnType<typeof computeRecentActivity>>>(cacheKey);
    if (cached) return cached;

    const activity = await computeRecentActivity(ctx.workspaceId);
    await setCached(cacheKey, activity);
    return activity;
  }),

  getHealthOverview: workspaceProcedure.query(async ({ ctx }) => {
    const cacheKey = dashboardCacheKey(ctx.workspaceId, "health");
    const cached = await getCached<Awaited<ReturnType<typeof computeHealthOverview>>>(cacheKey);
    if (cached) return cached;

    const health = await computeHealthOverview(ctx.workspaceId);
    await setCached(cacheKey, health);
    return health;
  }),

  getSourceTypeBreakdown: workspaceProcedure.query(async ({ ctx }) => {
    const cacheKey = dashboardCacheKey(ctx.workspaceId, "sources");
    const cached = await getCached<Awaited<ReturnType<typeof computeSourceTypeBreakdown>>>(cacheKey);
    if (cached) return cached;

    const breakdown = await computeSourceTypeBreakdown(ctx.workspaceId);
    await setCached(cacheKey, breakdown);
    return breakdown;
  }),
});

async function computeStats(workspaceId: string) {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [totalPacks, packsThisMonth, packsLastMonth, packsWithHealth, avgHealthThisMonth, avgHealthLastMonth, storiesTotal, storiesThisMonth, storiesLastMonth, sourcesTotal, sourcesThisMonth, sourcesLastMonth] =
    await Promise.all([
      db.pack.count({ where: { workspaceId } }),
      db.pack.count({
        where: { workspaceId, createdAt: { gte: thisMonthStart } },
      }),
      db.pack.count({
        where: {
          workspaceId,
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
      db.pack.findMany({
        where: { workspaceId, healthScore: { not: null } },
        select: { healthScore: true, lastHealthCheck: true },
      }),
      db.pack.aggregate({
        where: {
          workspaceId,
          healthScore: { not: null },
          lastHealthCheck: { gte: thisMonthStart },
        },
        _avg: { healthScore: true },
      }),
      db.pack.aggregate({
        where: {
          workspaceId,
          healthScore: { not: null },
          lastHealthCheck: { gte: lastMonthStart, lte: lastMonthEnd },
        },
        _avg: { healthScore: true },
      }),
      db.story.count({
        where: {
          packVersion: { pack: { workspaceId } },
          deletedAt: null,
        },
      }),
      db.story.count({
        where: {
          packVersion: { pack: { workspaceId } },
          deletedAt: null,
          createdAt: { gte: thisMonthStart },
        },
      }),
      db.story.count({
        where: {
          packVersion: { pack: { workspaceId } },
          deletedAt: null,
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
      db.source.count({
        where: { workspaceId, deletedAt: null },
      }),
      db.source.count({
        where: {
          workspaceId,
          deletedAt: null,
          createdAt: { gte: thisMonthStart },
        },
      }),
      db.source.count({
        where: {
          workspaceId,
          deletedAt: null,
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
    ]);

  const avgHealthScore =
    packsWithHealth.length > 0
      ? Math.round(
          packsWithHealth.reduce((s, p) => s + (p.healthScore ?? 0), 0) /
            packsWithHealth.length
        )
      : null;

  const avgHealthThis = avgHealthThisMonth._avg.healthScore ?? null;
  const avgHealthLast = avgHealthLastMonth._avg.healthScore ?? null;
  const healthTrend =
    avgHealthThis !== null && avgHealthLast !== null
      ? avgHealthThis - avgHealthLast
      : null;

  return {
    totalPacks,
    totalPacksTrend: packsThisMonth - packsLastMonth,
    avgHealthScore,
    avgHealthTrend: healthTrend,
    storiesGenerated: storiesTotal,
    storiesGeneratedTrend: storiesThisMonth - storiesLastMonth,
    sourcesIngested: sourcesTotal,
    sourcesIngestedTrend: sourcesThisMonth - sourcesLastMonth,
  };
}

async function computeRecentActivity(workspaceId: string) {
  const entries = await db.auditLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const members = await db.workspaceMember.findMany({
    where: { workspaceId, userId: { in: userIds } },
    select: { userId: true, email: true },
  });
  const userByUserId = new Map(members.map((m) => [m.userId, m.email]));

  const packIds = entries
    .filter((e) => e.entityType === "Pack" && e.entityId)
    .map((e) => e.entityId as string);
  const sourceIds = entries
    .filter((e) => e.entityType === "Source" && e.entityId && e.entityId !== "import")
    .map((e) => e.entityId as string);

  const [packs, sources] = await Promise.all([
    packIds.length > 0
      ? db.pack.findMany({
          where: { id: { in: packIds }, workspaceId },
          select: { id: true, projectId: true },
        })
      : [],
    sourceIds.length > 0
      ? db.source.findMany({
          where: { id: { in: sourceIds }, workspaceId },
          select: { id: true, projectId: true },
        })
      : [],
  ]);

  const packById = new Map(packs.map((p) => [p.id, p]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  return entries.map((e) => {
    let link: string | null = null;
    if (e.entityType === "Pack" && e.entityId) {
      const pack = packById.get(e.entityId);
      if (pack) {
        link = `/workspace/${workspaceId}/projects/${pack.projectId}/packs/${pack.id}`;
      }
    } else if (e.entityType === "Project" && e.entityId) {
      link = `/workspace/${workspaceId}/projects/${e.entityId}`;
    } else if (e.entityType === "Source" && e.entityId && e.entityId !== "import") {
      const source = sourceById.get(e.entityId);
      if (source) {
        link = `/workspace/${workspaceId}/projects/${source.projectId}`;
      }
    }

    return {
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata,
      createdAt: e.createdAt,
      userName: userByUserId.get(e.userId) ?? "Unknown",
      link,
    };
  });
}

async function computeHealthOverview(workspaceId: string) {
  const packs = await db.pack.findMany({
    where: { workspaceId },
    orderBy: { healthScore: "asc" },
    select: {
      id: true,
      name: true,
      healthScore: true,
      healthStatus: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });

  return packs.map((p) => ({
    id: p.id,
    name: p.name,
    projectName: p.project.name,
    projectId: p.projectId,
    healthScore: p.healthScore ?? 0,
    healthStatus: p.healthStatus ?? "healthy",
  }));
}

async function computeSourceTypeBreakdown(workspaceId: string) {
  const sources = await db.source.groupBy({
    by: ["type"],
    where: { workspaceId, deletedAt: null },
    _count: { type: true },
  });

  return sources.map((s) => ({
    type: s.type,
    count: s._count.type,
  }));
}
