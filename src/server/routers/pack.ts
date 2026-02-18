import { z } from "zod";
import { router, workspaceProcedure, publicProcedure } from "../trpc";
import { db } from "../db";
import { HealthStatus } from "@prisma/client";
import { generatePack } from "../services/generation";
import { assessSourceReadiness } from "../services/source-readiness";
import { refreshPack } from "../services/refresh";
import { runQARules } from "../services/qa-rules";
import { auditService } from "../services/audit";
import { computeAndPersistPackHealth } from "../services/health";
import { inngest } from "../inngest/client";
import Redis from "ioredis";
import { env } from "@/lib/env";
import crypto from "node:crypto";

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.REDIS_URL;
  if (!url) return null;
  _redis = new Redis(url);
  return _redis;
}

async function checkHealthRefreshRateLimit(packId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const key = `health-refresh:${packId}`;
  const ttl = await redis.ttl(key);
  if (ttl > 0) return false;
  await redis.setex(key, 60, "1");
  return true;
}

function hashSourceIds(sourceIds: string[]): string {
  return crypto.createHash("sha256").update(sourceIds.sort().join(",")).digest("hex").slice(0, 16);
}

export const packRouter = router({
  list: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return db.pack.findMany({
        where: { projectId: input.projectId, workspaceId: ctx.workspaceId },
        orderBy: { updatedAt: "desc" },
      });
    }),

  listNeedingAttention: workspaceProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: { workspaceId: string; healthStatus?: object; projectId?: string } = {
        workspaceId: ctx.workspaceId,
        healthStatus: { not: HealthStatus.healthy },
      };
      if (input.projectId) {
        where.projectId = input.projectId;
      }
      return db.pack.findMany({
        where,
        orderBy: { healthScore: "asc" },
        take: input.limit,
        include: {
          project: { select: { name: true } },
        },
      });
    }),

  getById: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: {
          project: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            include: {
              stories: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                include: {
                  acceptanceCriteria: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      });
      if (!pack) throw new Error("Pack not found");
      return pack;
    }),

  getHealth: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        select: {
          healthScore: true,
          healthStatus: true,
          lastHealthCheck: true,
          id: true,
        },
      });
      if (!pack) throw new Error("Pack not found");

      let score = pack.healthScore ?? 100;
      let status = pack.healthStatus ?? "healthy";
      let factors: Record<string, number> = {
        sourceDrift: 100,
        evidenceCoverage: 100,
        qaPassRate: 100,
        deliveryFeedback: 100,
        sourceAge: 100,
      };

      const latestHealth = await db.packHealth.findFirst({
        where: { packId: input.packId },
        orderBy: { computedAt: "desc" },
      });
      if (latestHealth) {
        score = latestHealth.score;
        status = latestHealth.status as "healthy" | "stale" | "at_risk" | "outdated";
        factors = (latestHealth.factors as Record<string, number>) ?? factors;
      } else {
        const result = await computeAndPersistPackHealth(input.packId);
        score = result.score;
        status = result.status;
        factors = result.factors;
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const previousHealth = await db.packHealth.findFirst({
        where: { packId: input.packId, computedAt: { lte: sevenDaysAgo } },
        orderBy: { computedAt: "desc" },
      });

      let trend: "improving" | "stable" | "declining" = "stable";
      if (previousHealth) {
        if (score > previousHealth.score) trend = "improving";
        else if (score < previousHealth.score) trend = "declining";
      }

      return {
        score,
        status,
        factors,
        computedAt: pack.lastHealthCheck,
        previousScore: previousHealth?.score,
        previousStatus: previousHealth?.status,
        trend,
      };
    }),

  refreshHealth: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const allowed = await checkHealthRefreshRateLimit(input.packId);
      if (!allowed) {
        throw new Error("Rate limited. Try again in a minute.");
      }

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: input.packId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.health.refresh",
        entityType: "Pack",
        entityId: input.packId,
      });

      return { message: "Health recomputation triggered" };
    }),

  refresh: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        sourceIds: z.array(z.string()).min(1),
        userNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await refreshPack({
        packId: input.packId,
        workspaceId: ctx.workspaceId,
        sourceIds: input.sourceIds,
        userNotes: input.userNotes,
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: input.packId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.refresh",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { packVersionId: result.packVersionId },
      });

      return result;
    }),

  runQa: workspaceProcedure
    .input(z.object({ packVersionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      const count = await runQARules(input.packVersionId);
      return { flagCount: count };
    }),

  assessReadiness: workspaceProcedure
    .input(z.object({ projectId: z.string(), sourceIds: z.array(z.string()).min(1) }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `readiness:${input.projectId}:${hashSourceIds(input.sourceIds)}`;
      const redis = getRedis();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached) as Awaited<ReturnType<typeof assessSourceReadiness>>;
          } catch {
            // invalid cache, continue
          }
        }
      }
      const report = await assessSourceReadiness(
        input.projectId,
        input.sourceIds,
        ctx.workspaceId
      );
      if (redis) {
        await redis.setex(cacheKey, 300, JSON.stringify(report));
      }
      return report;
    }),

  hasNewSources: workspaceProcedure
    .input(z.object({ packId: z.string(), projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const latestVersion = await db.packVersion.findFirst({
        where: { packId: input.packId },
        orderBy: { versionNumber: "desc" },
      });
      const previousSourceIds = (latestVersion?.sourceIds as string[]) ?? [];
      const allSources = await db.source.findMany({
        where: { projectId: input.projectId, workspaceId: ctx.workspaceId, deletedAt: null, status: "completed" },
        select: { id: true },
      });
      const newCount = allSources.filter((s) => !previousSourceIds.includes(s.id)).length;
      return { hasNew: newCount > 0, newCount };
    }),

  regenerate: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        sourceIds: z.array(z.string()).min(1),
        templateId: z.string().optional(),
        userNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const result = await generatePack({
        projectId: pack.projectId,
        workspaceId: ctx.workspaceId,
        sourceIds: input.sourceIds,
        templateId: input.templateId,
        userNotes: input.userNotes,
        packId: input.packId,
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: input.packId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.regenerate",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { packVersionId: result.packVersionId },
      });

      return { packId: input.packId, packVersionId: result.packVersionId };
    }),

  generate: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        sourceIds: z.array(z.string()).min(1),
        templateId: z.string().optional(),
        userNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await generatePack({
        projectId: input.projectId,
        workspaceId: ctx.workspaceId,
        sourceIds: input.sourceIds,
        templateId: input.templateId,
        userNotes: input.userNotes,
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: result.packId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.generate",
        entityType: "Pack",
        entityId: result.packId,
        metadata: { sourceIds: input.sourceIds },
      });

      return result;
    }),

  updateStory: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        persona: z.string().optional(),
        want: z.string().optional(),
        soThat: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId, deletedAt: null },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }
      await db.story.update({
        where: { id: input.storyId },
        data: {
          ...(input.persona !== undefined && { persona: input.persona }),
          ...(input.want !== undefined && { want: input.want }),
          ...(input.soThat !== undefined && { soThat: input.soThat }),
        },
      });
      return { packVersionId: story.packVersionId };
    }),

  updateAcceptanceCriteria: workspaceProcedure
    .input(
      z.object({
        acId: z.string(),
        given: z.string().optional(),
        when: z.string().optional(),
        then: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const ac = await db.acceptanceCriteria.findFirst({
        where: { id: input.acId, deletedAt: null },
        include: { story: { include: { packVersion: { include: { pack: true } } } } },
      });
      if (!ac || ac.story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Acceptance criteria not found");
      }
      await db.acceptanceCriteria.update({
        where: { id: input.acId },
        data: {
          ...(input.given !== undefined && { given: input.given }),
          ...(input.when !== undefined && { when: input.when }),
          ...(input.then !== undefined && { then: input.then }),
        },
      });
      return { packVersionId: ac.story.packVersionId };
    }),

  reorderStories: workspaceProcedure
    .input(z.object({ packVersionId: z.string(), storyIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      for (let i = 0; i < input.storyIds.length; i++) {
        await db.story.update({
          where: { id: input.storyIds[i] },
          data: { sortOrder: i },
        });
      }
      return { packVersionId: input.packVersionId };
    }),

  reorderAcceptanceCriteria: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        acIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }
      for (let i = 0; i < input.acIds.length; i++) {
        await db.acceptanceCriteria.update({
          where: { id: input.acIds[i] },
          data: { sortOrder: i },
        });
      }
      return { packVersionId: story.packVersionId };
    }),

  addStory: workspaceProcedure
    .input(
      z.object({
        packVersionId: z.string(),
        persona: z.string(),
        want: z.string(),
        soThat: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      const maxOrder = await db.story
        .aggregate({
          where: { packVersionId: input.packVersionId, deletedAt: null },
          _max: { sortOrder: true },
        })
        .then((r) => r._max.sortOrder ?? -1);
      const story = await db.story.create({
        data: {
          packVersionId: input.packVersionId,
          sortOrder: maxOrder + 1,
          persona: input.persona,
          want: input.want,
          soThat: input.soThat,
        },
      });
      return { story, packVersionId: input.packVersionId };
    }),

  addAcceptanceCriteria: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        given: z.string(),
        when: z.string(),
        then: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }
      const maxOrder = await db.acceptanceCriteria
        .aggregate({
          where: { storyId: input.storyId, deletedAt: null },
          _max: { sortOrder: true },
        })
        .then((r) => r._max.sortOrder ?? -1);
      const ac = await db.acceptanceCriteria.create({
        data: {
          storyId: input.storyId,
          sortOrder: maxOrder + 1,
          given: input.given,
          when: input.when,
          then: input.then,
        },
      });
      return { ac, packVersionId: story.packVersionId };
    }),

  deleteStory: workspaceProcedure
    .input(z.object({ storyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }
      await db.story.update({
        where: { id: input.storyId },
        data: { deletedAt: new Date() },
      });
      return { packVersionId: story.packVersionId };
    }),

  deleteAcceptanceCriteria: workspaceProcedure
    .input(z.object({ acId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ac = await db.acceptanceCriteria.findFirst({
        where: { id: input.acId },
        include: { story: { include: { packVersion: { include: { pack: true } } } } },
      });
      if (!ac || ac.story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Acceptance criteria not found");
      }
      await db.acceptanceCriteria.update({
        where: { id: input.acId },
        data: { deletedAt: new Date() },
      });
      return { packVersionId: ac.story.packVersionId };
    }),

  createVersionSnapshot: workspaceProcedure
    .input(z.object({ packVersionId: z.string(), changeSummary: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: {
          pack: true,
          stories: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              acceptanceCriteria: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      const latestVersion = await db.packVersion.findFirst({
        where: { packId: version.packId },
        orderBy: { versionNumber: "desc" },
      });
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      const newVersion = await db.packVersion.create({
        data: {
          packId: version.packId,
          versionNumber,
          sourceIds: version.sourceIds as string[],
          summary: version.summary,
          nonGoals: version.nonGoals,
          openQuestions: (version.openQuestions ?? []) as object,
          assumptions: (version.assumptions ?? []) as object,
          decisions: (version.decisions ?? []) as object,
          risks: (version.risks ?? []) as object,
          generationConfig: {
            ...((version.generationConfig as object) ?? {}),
            snapshotFrom: input.packVersionId,
            changeSummary: input.changeSummary,
          },
        },
      });
      for (const s of version.stories) {
        const story = await db.story.create({
          data: {
            packVersionId: newVersion.id,
            sortOrder: s.sortOrder,
            persona: s.persona,
            want: s.want,
            soThat: s.soThat,
          },
        });
        for (const ac of s.acceptanceCriteria) {
          await db.acceptanceCriteria.create({
            data: {
              storyId: story.id,
              sortOrder: ac.sortOrder,
              given: ac.given,
              when: ac.when,
              then: ac.then,
            },
          });
        }
      }
      await runQARules(newVersion.id);
      return { packVersionId: newVersion.id, versionNumber: newVersion.versionNumber };
    }),

  lockVersion: workspaceProcedure
    .input(z.object({ packVersionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      await db.packVersion.update({
        where: { id: input.packVersionId },
        data: { editLockUserId: ctx.userId },
      });
      return { packVersionId: input.packVersionId };
    }),

  unlockVersion: workspaceProcedure
    .input(z.object({ packVersionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      await db.packVersion.update({
        where: { id: input.packVersionId },
        data: { editLockUserId: null },
      });
      return { packVersionId: input.packVersionId };
    }),

  shareForReview: workspaceProcedure
    .input(z.object({ packVersionId: z.string(), expiresInDays: z.number().default(7) }))
    .mutation(async ({ ctx, input }) => {
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Pack version not found");
      }
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
      const link = await db.reviewLink.create({
        data: {
          packVersionId: input.packVersionId,
          token,
          expiresAt,
        },
      });
      return {
        token,
        url: `/review/${token}`,
        expiresAt: link.expiresAt,
      };
    }),

  revokeReviewLink: workspaceProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await db.reviewLink.findFirst({
        where: { token: input.token },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!link || link.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Review link not found");
      }
      await db.reviewLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
      });
      return { revoked: true };
    }),

  getReviewLink: workspaceProcedure
    .input(z.object({ packVersionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const link = await db.reviewLink.findFirst({
        where: {
          packVersionId: input.packVersionId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!link) return null;
      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: { pack: true },
      });
      if (!version || version.pack.workspaceId !== ctx.workspaceId) return null;
      return {
        token: link.token,
        url: `/review/${link.token}`,
        expiresAt: link.expiresAt,
      };
    }),

  getByReviewToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const link = await db.reviewLink.findFirst({
        where: {
          token: input.token,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          packVersion: {
            include: {
              pack: { include: { project: true } },
              stories: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                include: {
                  acceptanceCriteria: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
          comments: true,
        },
      });
      if (!link) return null;
      await db.reviewLink.update({
        where: { id: link.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });
      return {
        packName: link.packVersion.pack.name,
        projectName: link.packVersion.pack.project.name,
        versionNumber: link.packVersion.versionNumber,
        summary: link.packVersion.summary,
        nonGoals: link.packVersion.nonGoals,
        openQuestions: (link.packVersion.openQuestions as string[]) ?? [],
        assumptions: (link.packVersion.assumptions as string[]) ?? [],
        decisions: (link.packVersion.decisions as string[]) ?? [],
        risks: (link.packVersion.risks as string[]) ?? [],
        stories: link.packVersion.stories.map((s) => ({
          id: s.id,
          persona: s.persona,
          want: s.want,
          soThat: s.soThat,
          acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
            id: ac.id,
            given: ac.given,
            when: ac.when,
            then: ac.then,
          })),
        })),
        comments: link.comments,
      };
    }),

  getTraceabilityGraph: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: {
          project: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                include: {
                  acceptanceCriteria: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: "asc" },
                  },
                },
              },
            },
          },
        },
      });
      if (!pack || !pack.versions[0]) {
        return { nodes: [], edges: [], nodeCount: 0, edgeCount: 0, evidenceCoveragePct: 100 };
      }

      const version = pack.versions[0];
      const sourceIds = (version.sourceIds as string[]) ?? [];
      const sources = sourceIds.length
        ? await db.source.findMany({
            where: { id: { in: sourceIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        : [];

      const storyIds = version.stories.map((s) => s.id);
      const acIds = version.stories.flatMap((s) =>
        s.acceptanceCriteria.map((ac) => ac.id)
      );
      const allEntityIds = [...storyIds, ...acIds];

      const evidenceLinks = allEntityIds.length
        ? await db.evidenceLink.findMany({
            where: {
              entityId: { in: allEntityIds },
              entityType: { in: ["story", "acceptance_criteria"] },
            },
            include: {
              sourceChunk: {
                include: { source: { select: { id: true, name: true } } },
              },
            },
          })
        : [];

      const nodes: Array<{
        id: string;
        type: "source" | "story" | "ac" | "evidence" | "chunk";
        label: string;
        data: Record<string, unknown>;
      }> = [];
      const edges: Array<{ id: string; source: string; target: string; type?: string }> = [];
      const seen = new Set<string>();

      for (const s of sources) {
        const id = `source-${s.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          nodes.push({
            id,
            type: "source",
            label: s.name,
            data: { sourceId: s.id, name: s.name },
          });
        }
      }

      for (const story of version.stories) {
        const id = `story-${story.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          const label = `${story.persona}: ${story.want}`.slice(0, 60);
          nodes.push({
            id,
            type: "story",
            label,
            data: { storyId: story.id, persona: story.persona, want: story.want },
          });
        }
        for (const src of sources) {
          edges.push({
            id: `e-src-${src.id}-story-${story.id}`,
            source: `source-${src.id}`,
            target: `story-${story.id}`,
            type: "informs",
          });
        }
        for (const ac of story.acceptanceCriteria) {
          const acId = `ac-${ac.id}`;
          if (!seen.has(acId)) {
            seen.add(acId);
            const acIndex = story.acceptanceCriteria.findIndex((a) => a.id === ac.id) + 1;
            nodes.push({
              id: acId,
              type: "ac",
              label: `AC ${acIndex}`,
              data: { acId: ac.id, given: ac.given, when: ac.when, then: ac.then },
            });
          }
          edges.push({
            id: `e-story-${story.id}-ac-${ac.id}`,
            source: `story-${story.id}`,
            target: acId,
            type: "defines",
          });
        }
      }

      for (const link of evidenceLinks) {
        const evId = `evidence-${link.id}`;
        if (!seen.has(evId)) {
          seen.add(evId);
          nodes.push({
            id: evId,
            type: "evidence",
            label: link.confidence,
            data: { evidenceId: link.id, confidence: link.confidence },
          });
        }
        const entityId = link.entityId;
        const entityType = link.entityType;
        const targetId = entityType === "story" ? `story-${entityId}` : `ac-${entityId}`;
        edges.push({
          id: `e-${targetId}-ev-${link.id}`,
          source: targetId,
          target: evId,
          type: "supported_by",
        });

        const chunk = link.sourceChunk;
        if (chunk) {
          const chunkId = `chunk-${chunk.id}`;
          if (!seen.has(chunkId)) {
            seen.add(chunkId);
            const snippet = chunk.content.slice(0, 50).replace(/\s+/g, " ");
            nodes.push({
              id: chunkId,
              type: "chunk",
              label: snippet,
              data: {
                chunkId: chunk.id,
                sourceId: chunk.source?.id,
                sourceName: chunk.source?.name,
                content: chunk.content,
              },
            });
          }
          edges.push({
            id: `e-ev-${link.id}-chunk-${chunk.id}`,
            source: evId,
            target: chunkId,
            type: "references",
          });
        }
      }

      const totalAc = acIds.length;
      const acsWithEvidence = new Set(
        evidenceLinks.filter((l) => l.entityType === "acceptance_criteria").map((l) => l.entityId)
      ).size;
      const evidenceCoveragePct: number =
        totalAc > 0 ? Math.round((acsWithEvidence / totalAc) * 100) : 100;

      return {
        nodes,
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        evidenceCoveragePct,
      };
    }),

  addReviewComment: publicProcedure
    .input(
      z.object({
        token: z.string(),
        entityType: z.enum(["story", "acceptance_criteria"]),
        entityId: z.string(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const link = await db.reviewLink.findFirst({
        where: {
          token: input.token,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!link) throw new Error("Review link not found or expired");
      const comment = await db.reviewComment.create({
        data: {
          reviewLinkId: link.id,
          entityType: input.entityType,
          entityId: input.entityId,
          content: input.content,
        },
      });
      return { comment };
    }),
});
