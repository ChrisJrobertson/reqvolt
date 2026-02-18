import { z } from "zod";
import { router, platformAdminProcedure } from "../trpc";
import { db } from "../db";
import { computeEditAnalytics, type EditAnalytics } from "../services/edit-analytics";

const periodSchema = z.enum(["30d", "90d", "all"]);

function dateFromPeriod(period: string): Date | null {
  const now = new Date();
  if (period === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (period === "90d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return d;
  }
  return null;
}

export const adminQualityRouter = router({
  overview: platformAdminProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ input }) => {
      const since = dateFromPeriod(input.period);

      const versions = await db.packVersion.findMany({
        where: since ? { createdAt: { gte: since } } : {},
        select: {
          id: true,
          confidenceScore: true,
          confidenceLevel: true,
          selfReviewRun: true,
          selfReviewPassed: true,
          packId: true,
          createdAt: true,
        },
      });

      const withScore = versions.filter((v) => v.confidenceScore != null);
      const avgConfidence =
        withScore.length > 0
          ? withScore.reduce((s, v) => s + (v.confidenceScore ?? 0), 0) / withScore.length
          : 0;
      const highCount = versions.filter((v) => v.confidenceLevel === "high").length;
      const moderateCount = versions.filter((v) => v.confidenceLevel === "moderate").length;
      const lowCount = versions.filter((v) => v.confidenceLevel === "low").length;
      const selfReviewPassed = versions.filter((v) => v.selfReviewRun && v.selfReviewPassed).length;
      const selfReviewRun = versions.filter((v) => v.selfReviewRun).length;

      return {
        totalPacksGenerated: versions.length,
        averageConfidenceScore: Math.round(avgConfidence),
        confidenceDistribution: { high: highCount, moderate: moderateCount, low: lowCount },
        selfReviewPassRate: selfReviewRun > 0 ? (selfReviewPassed / selfReviewRun) * 100 : 0,
      };
    }),

  feedbackSummary: platformAdminProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ input }) => {
      const since = dateFromPeriod(input.period);

      const storyFeedback = await db.storyFeedback.findMany({
        where: since ? { createdAt: { gte: since } } : {},
      });
      const packFeedback = await db.packFeedback.findMany({
        where: since ? { createdAt: { gte: since } } : {},
      });

      const storyUp = storyFeedback.filter((f) => f.rating === "UP").length;
      const storyDown = storyFeedback.filter((f) => f.rating === "DOWN").length;
      const storyPositivePct =
        storyFeedback.length > 0 ? (storyUp / (storyUp + storyDown)) * 100 : 0;

      const packPositive = packFeedback.filter((f) => f.rating === "POSITIVE").length;
      const packNeutral = packFeedback.filter((f) => f.rating === "NEUTRAL").length;
      const packNegative = packFeedback.filter((f) => f.rating === "NEGATIVE").length;

      return {
        storyFeedback: {
          total: storyFeedback.length,
          positivePct: Math.round(storyPositivePct),
          up: storyUp,
          down: storyDown,
        },
        packFeedback: {
          positive: packPositive,
          neutral: packNeutral,
          negative: packNegative,
        },
      };
    }),

  editAnalytics: platformAdminProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ input }) => {
      const since = dateFromPeriod(input.period);

      const packs = await db.pack.findMany({
        where: since ? { createdAt: { gte: since } } : {},
        select: { id: true },
      });

      const results: EditAnalytics[] = [];
      for (const pack of packs) {
        const r = await computeEditAnalytics(pack.id);
        if (r) results.push(r);
      }

      const avgUnchanged =
        results.length > 0 ? results.reduce((s, r) => s + r.unchangedRate, 0) / results.length : 0;
      const avgStoriesDeleted =
        results.length > 0
          ? results.reduce((s, r) => s + r.storiesDeleted, 0) / results.length
          : 0;
      const avgStoriesAdded =
        results.length > 0 ? results.reduce((s, r) => s + r.storiesAdded, 0) / results.length : 0;

      return {
        packsAnalysed: results.length,
        averageUnchangedRate: Math.round(avgUnchanged),
        averageStoriesDeleted: Math.round(avgStoriesDeleted * 10) / 10,
        averageStoriesAdded: Math.round(avgStoriesAdded * 10) / 10,
        sample: results.slice(0, 5),
      };
    }),

  modelUsage: platformAdminProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ input }) => {
      const since = dateFromPeriod(input.period);

      const usage = await db.modelUsage.findMany({
        where: since ? { createdAt: { gte: since } } : {},
      });

      const byModel = usage.reduce(
        (acc, u) => {
          acc[u.model] = (acc[u.model] ?? 0) + u.inputTokens + u.outputTokens;
          return acc;
        },
        {} as Record<string, number>
      );
      const byTask = usage.reduce(
        (acc, u) => {
          acc[u.task] = (acc[u.task] ?? 0) + u.inputTokens + u.outputTokens;
          return acc;
        },
        {} as Record<string, number>
      );

      const totalTokens = usage.reduce((s, u) => s + u.inputTokens + u.outputTokens, 0);

      return {
        totalTokens,
        byModel,
        byTask,
        recordCount: usage.length,
      };
    }),

  qualityBySourceType: platformAdminProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ input }) => {
      const since = dateFromPeriod(input.period);

      const versions = await db.packVersion.findMany({
        where: since ? { createdAt: { gte: since } } : {},
        select: { id: true, sourceIds: true, confidenceScore: true },
      });

      const byType: Record<string, { confidenceSum: number; count: number }> = {};
      for (const v of versions) {
        const sourceIds = (v.sourceIds as string[]) ?? [];
        const sources = sourceIds.length
          ? await db.source.findMany({
              where: { id: { in: sourceIds } },
              select: { type: true },
            })
          : [];
        const primaryType = sources[0]?.type ?? "OTHER";
        if (!byType[primaryType]) {
          byType[primaryType] = { confidenceSum: 0, count: 0 };
        }
        byType[primaryType]!.count++;
        byType[primaryType]!.confidenceSum += v.confidenceScore ?? 0;
      }

      return Object.entries(byType).map(([type, data]) => ({
        sourceType: type,
        packCount: data.count,
        avgConfidence: data.count > 0 ? Math.round(data.confidenceSum / data.count) : 0,
      }));
    }),
});
