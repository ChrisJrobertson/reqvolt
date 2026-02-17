import { z } from "zod";
import Redis from "ioredis";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { env } from "@/lib/env";
import { computeEditAnalytics } from "../services/edit-analytics";

const periodSchema = z.enum(["30d", "90d", "all"]).default("30d");

const SONNET_INPUT_PER_1K = 0.003;
const SONNET_OUTPUT_PER_1K = 0.015;
const HAIKU_INPUT_PER_1K = 0.0008;
const HAIKU_OUTPUT_PER_1K = 0.004;

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (!env.REDIS_URL) return null;
  _redis = new Redis(env.REDIS_URL);
  return _redis;
}

function parseAdminUsers(): Set<string> {
  return new Set(
    (env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function ensureAdmin(userId: string) {
  const adminUsers = parseAdminUsers();
  if (!adminUsers.has(userId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

function getDateRange(period: "30d" | "90d" | "all") {
  if (period === "all") return null;
  const days = period === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function cachedAggregate<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Recompute if cache payload is malformed.
    }
  }
  const value = await fn();
  await redis.setex(key, 60 * 60, JSON.stringify(value));
  return value;
}

export const adminQualityRouter = router({
  overview: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      ensureAdmin(ctx.userId);
      return cachedAggregate(`admin-quality:overview:${input.period}`, async () => {
        const since = getDateRange(input.period);
        const where = since ? { createdAt: { gte: since } } : {};
        const packVersions = await db.packVersion.findMany({
          where,
          select: {
            id: true,
            confidenceScore: true,
            selfReviewPassed: true,
            createdAt: true,
          },
        });

        const scored = packVersions.filter(
          (version) => typeof version.confidenceScore === "number"
        );
        const avgConfidence = scored.length
          ? Math.round(
              scored.reduce((sum, version) => sum + (version.confidenceScore ?? 0), 0) /
                scored.length
            )
          : 0;

        const distribution = {
          high: scored.filter((version) => (version.confidenceScore ?? 0) >= 85).length,
          moderate: scored.filter((version) => {
            const score = version.confidenceScore ?? 0;
            return score >= 65 && score < 85;
          }).length,
          low: scored.filter((version) => (version.confidenceScore ?? 0) < 65).length,
        };

        const selfReviewRuns = packVersions.filter(
          (version) => version.selfReviewPassed !== null
        );
        const selfReviewPassRate = selfReviewRuns.length
          ? Math.round(
              (selfReviewRuns.filter((version) => version.selfReviewPassed).length /
                selfReviewRuns.length) *
                100
            )
          : 0;

        return {
          totalPacksGenerated: packVersions.length,
          averageConfidenceScore: avgConfidence,
          confidenceDistribution: distribution,
          selfReviewPassRate,
        };
      });
    }),

  feedbackSummary: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      ensureAdmin(ctx.userId);
      return cachedAggregate(`admin-quality:feedback:${input.period}`, async () => {
        const since = getDateRange(input.period);
        const where = since ? { createdAt: { gte: since } } : {};

        const [storyFeedback, packFeedback] = await Promise.all([
          db.storyFeedback.findMany({ where, select: { rating: true } }),
          db.packFeedback.findMany({ where, select: { rating: true } }),
        ]);

        const upCount = storyFeedback.filter((row) => row.rating === "UP").length;
        const downCount = storyFeedback.filter((row) => row.rating === "DOWN").length;
        const storyPositiveRatio = upCount + downCount > 0 ? Math.round((upCount / (upCount + downCount)) * 100) : 0;

        const packDistribution = {
          positive: packFeedback.filter((row) => row.rating === "POSITIVE").length,
          neutral: packFeedback.filter((row) => row.rating === "NEUTRAL").length,
          negative: packFeedback.filter((row) => row.rating === "NEGATIVE").length,
        };

        return {
          storyFeedback: { upCount, downCount, positiveRatio: storyPositiveRatio },
          packFeedback: packDistribution,
        };
      });
    }),

  editAnalytics: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      ensureAdmin(ctx.userId);
      return cachedAggregate(`admin-quality:edit:${input.period}`, async () => {
        const since = getDateRange(input.period);
        const packs = await db.pack.findMany({
          where: since ? { createdAt: { gte: since } } : {},
          select: {
            id: true,
            versions: {
              select: { id: true },
            },
          },
          take: 100,
        });
        const analysablePackIds = packs
          .filter((pack) => pack.versions.length >= 2)
          .map((pack) => pack.id);

        const reports = await Promise.all(
          analysablePackIds.map(async (packId) => {
            try {
              return await computeEditAnalytics(packId);
            } catch {
              return null;
            }
          })
        );
        const validReports = reports.filter(
          (report): report is NonNullable<typeof report> => report !== null
        );

        const average = (values: number[]) =>
          values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;

        return {
          analysedPacks: validReports.length,
          averageUnchangedRate: average(validReports.map((report) => report.unchangedRate)),
          storiesDeletedPerPack: average(validReports.map((report) => report.storiesDeleted)),
          storiesAddedPerPack: average(validReports.map((report) => report.storiesAdded)),
          averageAcsRewritten: average(validReports.map((report) => report.acsRewritten)),
        };
      });
    }),

  modelUsage: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      ensureAdmin(ctx.userId);
      return cachedAggregate(`admin-quality:model-usage:${input.period}`, async () => {
        const since = getDateRange(input.period);
        const usage = await db.modelUsage.findMany({
          where: since ? { createdAt: { gte: since } } : {},
          select: {
            model: true,
            task: true,
            inputTokens: true,
            outputTokens: true,
          },
        });

        const byModel: Record<
          string,
          { inputTokens: number; outputTokens: number; estimatedCost: number }
        > = {};
        const byTask: Record<string, { inputTokens: number; outputTokens: number }> = {};

        for (const row of usage) {
          const modelKey = row.model;
          const isHaiku = modelKey.toLowerCase().includes("haiku");
          const cost =
            (row.inputTokens / 1000) * (isHaiku ? HAIKU_INPUT_PER_1K : SONNET_INPUT_PER_1K) +
            (row.outputTokens / 1000) * (isHaiku ? HAIKU_OUTPUT_PER_1K : SONNET_OUTPUT_PER_1K);

          byModel[modelKey] = byModel[modelKey] ?? {
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0,
          };
          byModel[modelKey]!.inputTokens += row.inputTokens;
          byModel[modelKey]!.outputTokens += row.outputTokens;
          byModel[modelKey]!.estimatedCost += cost;

          byTask[row.task] = byTask[row.task] ?? { inputTokens: 0, outputTokens: 0 };
          byTask[row.task]!.inputTokens += row.inputTokens;
          byTask[row.task]!.outputTokens += row.outputTokens;
        }

        const estimatedCostTotal = Object.values(byModel).reduce(
          (sum, model) => sum + model.estimatedCost,
          0
        );

        return {
          totalCalls: usage.length,
          estimatedCostTotal: Number(estimatedCostTotal.toFixed(3)),
          byModel,
          byTask,
        };
      });
    }),

  qualityBySourceType: protectedProcedure
    .input(z.object({ period: periodSchema }))
    .query(async ({ ctx, input }) => {
      ensureAdmin(ctx.userId);
      return cachedAggregate(`admin-quality:source-type:${input.period}`, async () => {
        const since = getDateRange(input.period);
        const versions = await db.packVersion.findMany({
          where: since ? { createdAt: { gte: since } } : {},
          select: {
            id: true,
            confidenceScore: true,
            sourceIds: true,
          },
        });

        const sourceIds = Array.from(
          new Set(
            versions.flatMap((version) =>
              Array.isArray(version.sourceIds) ? (version.sourceIds as string[]) : []
            )
          )
        );

        const sources = await db.source.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, type: true },
        });
        const typeBySourceId = new Map(sources.map((source) => [source.id, source.type]));

        const aggregate: Record<string, { confidenceScores: number[]; packCount: number }> = {};
        for (const version of versions) {
          const ids = (version.sourceIds as string[] | null) ?? [];
          const sourceTypes = Array.from(new Set(ids.map((id) => typeBySourceId.get(id)).filter(Boolean)));
          for (const type of sourceTypes) {
            aggregate[type!] = aggregate[type!] ?? { confidenceScores: [], packCount: 0 };
            aggregate[type!]!.packCount += 1;
            if (typeof version.confidenceScore === "number") {
              aggregate[type!]!.confidenceScores.push(version.confidenceScore);
            }
          }
        }

        return Object.entries(aggregate).map(([sourceType, data]) => ({
          sourceType,
          avgConfidence: data.confidenceScores.length
            ? Math.round(
                data.confidenceScores.reduce((sum, score) => sum + score, 0) /
                  data.confidenceScores.length
              )
            : 0,
          packCount: data.packCount,
        }));
      });
    }),
});
