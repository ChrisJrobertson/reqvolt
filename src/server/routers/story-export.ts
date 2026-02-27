import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { inngest } from "../inngest/client";
import * as mondayApi from "../integrations/monday";
import {
  getJiraClient,
  updateJiraIssue,
} from "../services/jira";
import {
  getEvidenceMapForPackVersion,
  getEvidenceSummaryForStory,
} from "../services/pack";
import type { FieldMapping } from "../integrations/monday";

export const storyExportRouter = router({
  syncStatus: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: {
                where: { deletedAt: null },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!pack) throw new Error("Pack not found");
      const version = pack.versions[0];
      const storyIds = version?.stories.map((s) => s.id) ?? [];
      const totalArtefacts = storyIds.length;

      const exports = await db.storyExport.findMany({
        where: { packId: input.packId },
      });

      const mondayStoryIds = new Set(
        exports.filter((e) => e.externalSystem === "monday").map((e) => e.storyId)
      );
      const jiraStoryIds = new Set(
        exports.filter((e) => e.externalSystem === "jira").map((e) => e.storyId)
      );
      const pushedToMonday = mondayStoryIds.size;
      const pushedToJira = jiraStoryIds.size;
      const notYetPushed = storyIds.filter(
        (id) => !mondayStoryIds.has(id) && !jiraStoryIds.has(id)
      ).length;
      const changedSincePush = exports.filter((e) => e.changedSincePush).length;

      return {
        totalArtefacts,
        pushedToMonday,
        pushedToJira,
        notYetPushed,
        changedSincePush,
      };
    }),

  syncMap: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
                select: { id: true, want: true },
              },
            },
          },
        },
      });
      if (!pack) throw new Error("Pack not found");
      const stories = pack.versions[0]?.stories ?? [];
      const exports = await db.storyExport.findMany({
        where: { packId: input.packId },
      });

      const mondayByStory = new Map(
        exports
          .filter((e) => e.externalSystem === "monday")
          .map((e) => [e.storyId, e])
      );
      const jiraByStory = new Map(
        exports
          .filter((e) => e.externalSystem === "jira")
          .map((e) => [e.storyId, e])
      );

      return stories.map((s) => {
        const monday = mondayByStory.get(s.id);
        const jira = jiraByStory.get(s.id);
        return {
          storyId: s.id,
          title: s.want,
          mondayItemId: monday?.externalId ?? null,
          mondayUrl: monday?.externalUrl ?? null,
          jiraIssueKey: jira?.externalId ?? null,
          jiraUrl: jira?.externalUrl ?? null,
          lastPushDate: monday?.lastSyncedAt ?? jira?.lastSyncedAt ?? null,
          changedSincePush: (monday?.changedSincePush ?? false) || (jira?.changedSincePush ?? false),
        };
      });
    }),

  pushHistory: workspaceProcedure
    .input(z.object({ projectId: z.string(), limit: z.number().optional().default(30) }))
    .query(async ({ ctx, input }) => {
      const packs = await db.pack.findMany({
        where: { projectId: input.projectId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const packIds = packs.map((p) => p.id);

      const mondayLogs = await db.mondayPushLog.findMany({
        where: { packVersion: { packId: { in: packIds } } },
        include: {
          packVersion: { include: { pack: { select: { name: true } } } },
        },
        orderBy: { pushedAt: "desc" },
        take: input.limit * 3,
      });

      const byBatch = new Map<
        string,
        { date: Date; packName: string; targetSystem: string; artefactCount: number; errorCount: number }
      >();
      for (const log of mondayLogs) {
        const batchKey = `monday-${log.packVersionId}-${Math.floor(log.pushedAt.getTime() / 60000)}`;
        if (!byBatch.has(batchKey)) {
          byBatch.set(batchKey, {
            date: log.pushedAt,
            packName: log.packVersion.pack.name,
            targetSystem: "Monday.com",
            artefactCount: 0,
            errorCount: 0,
          });
        }
        const b = byBatch.get(batchKey)!;
        b.artefactCount++;
        if (log.status === "failed") b.errorCount++;
      }

      const jiraExports = await db.storyExport.findMany({
        where: { packId: { in: packIds }, externalSystem: "jira" },
        include: { pack: { select: { name: true } } },
      });
      const jiraByPack = new Map<
        string,
        { packName: string; maxDate: Date; count: number; errors: number }
      >();
      for (const e of jiraExports) {
        const d = e.lastSyncedAt ?? e.updatedAt ?? e.createdAt;
        if (!jiraByPack.has(e.packId)) {
          jiraByPack.set(e.packId, {
            packName: e.pack.name,
            maxDate: d,
            count: 0,
            errors: 0,
          });
        }
        const j = jiraByPack.get(e.packId)!;
        j.count++;
        if (e.syncError) j.errors++;
        if (d > j.maxDate) j.maxDate = d;
      }
      for (const [packId, j] of jiraByPack) {
        byBatch.set(`jira-${packId}`, {
          date: j.maxDate,
          packName: j.packName,
          targetSystem: "Jira",
          artefactCount: j.count,
          errorCount: j.errors,
        });
      }

      return Array.from(byBatch.values())
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, input.limit);
    }),

  rePushChanged: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        target: z.enum(["monday", "jira"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const changed = await db.storyExport.findMany({
        where: {
          packId: input.packId,
          externalSystem: input.target,
          changedSincePush: true,
        },
        include: { story: true },
      });

      if (changed.length === 0) {
        return { repushed: 0 };
      }

      let successCount = 0;
      for (const exportRecord of changed) {
        try {
          const story = await db.story.findFirst({
            where: { id: exportRecord.storyId, deletedAt: null },
            include: {
              packVersion: { include: { pack: true } },
              acceptanceCriteria: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } },
            },
          });
          if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) continue;

          if (input.target === "jira") {
            const client = await getJiraClient(ctx.workspaceId);
            if (!client) break;
            const evidenceMap = await getEvidenceMapForPackVersion(story.packVersionId);
            const acIds = story.acceptanceCriteria.map((ac) => ac.id);
            const evidenceSummary = getEvidenceSummaryForStory(
              evidenceMap,
              story.id,
              acIds
            );
            const summary = mondayApi.buildStoryTitle(
              story.persona,
              story.want,
              story.soThat
            );
            const acLines = story.acceptanceCriteria
              .map(
                (ac) =>
                  `* Given: ${ac.given}\n* When: ${ac.when}\n* Then: ${ac.then}`
              )
              .join("\n\n");
            const description = {
              type: "doc" as const,
              version: 1,
              content: [
                {
                  type: "paragraph" as const,
                  content: [{ type: "text" as const, text: `Evidence: ${evidenceSummary}` }],
                },
                { type: "paragraph" as const, content: [{ type: "text" as const, text: "Acceptance criteria:" }] },
                { type: "paragraph" as const, content: [{ type: "text" as const, text: acLines }] },
              ],
            };
            await updateJiraIssue(client, exportRecord.externalId, {
              summary,
              description,
            });
          } else {
            const conn = await db.mondayConnection.findUnique({
              where: { workspaceId: ctx.workspaceId },
            });
            if (!conn) break;
            const mapping = (conn.fieldMapping ?? {}) as FieldMapping;
            const evidenceMap = await getEvidenceMapForPackVersion(story.packVersionId);
            const acIds = story.acceptanceCriteria.map((ac) => ac.id);
            const evidenceSummary = getEvidenceSummaryForStory(
              evidenceMap,
              story.id,
              acIds
            );
            const columnValues = mondayApi.buildColumnValues(mapping, {
              persona: story.persona,
              want: story.want,
              soThat: story.soThat,
              evidence: evidenceSummary,
              storyId: story.id,
            });
            await mondayApi.changeMultipleColumnValues(
              conn.accessToken,
              conn.mondayBoardId,
              exportRecord.externalId,
              columnValues
            );
          }

          await db.storyExport.update({
            where: { id: exportRecord.id },
            data: { changedSincePush: false, lastSyncedAt: new Date() },
          });
          successCount++;
        } catch {
          // Leave changedSincePush true on failure
        }
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "stories_repushed",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { target: input.target, count: successCount },
      });

      return { repushed: successCount };
    }),

  list: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const [exports, total] = await Promise.all([
        db.storyExport.findMany({
          where: { packId: input.packId },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
          include: {
            story: { select: { id: true, want: true } },
          },
        }),
        db.storyExport.count({
          where: { packId: input.packId },
        }),
      ]);

      return {
        exports: exports.map((e) => ({
          id: e.id,
          storyId: e.storyId,
          storyTitle: e.story.want,
          externalSystem: e.externalSystem,
          externalId: e.externalId,
          externalUrl: e.externalUrl,
          externalStatus: e.externalStatus,
          externalStatusCategory: e.externalStatusCategory,
          lastSyncedAt: e.lastSyncedAt,
          syncError: e.syncError,
        })),
        total,
      };
    }),

  triggerSync: workspaceProcedure
    .input(z.object({ packId: z.string(), externalSystem: z.enum(["jira", "monday"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const where: { packId: string; externalSystem?: string } = {
        packId: input.packId,
      };
      if (input.externalSystem) {
        where.externalSystem = input.externalSystem;
      }

      const exports = await db.storyExport.findMany({
        where,
        select: { id: true },
      });

      if (exports.length === 0) {
        return { triggered: 0 };
      }

      await inngest.send({
        name: "story-export/sync.requested",
        data: {
          packId: input.packId,
          workspaceId: ctx.workspaceId,
          externalSystem: input.externalSystem,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "storyExport.triggerSync",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { count: exports.length },
      });

      return { triggered: exports.length };
    }),

  pushUpdate: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        targetSystem: z.enum(["jira", "monday"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId, deletedAt: null },
        include: {
          packVersion: { include: { pack: true } },
          acceptanceCriteria: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }

      const exportRecord = await db.storyExport.findFirst({
        where: {
          storyId: input.storyId,
          externalSystem: input.targetSystem,
        },
        orderBy: { updatedAt: "desc" },
      });

      if (!exportRecord) {
        throw new Error(
          input.targetSystem === "jira"
            ? "Story not exported to Jira"
            : "Story not exported to Monday.com"
        );
      }

      if (input.targetSystem === "jira") {
        const client = await getJiraClient(ctx.workspaceId);
        if (!client) throw new Error("Jira not connected");

        const evidenceMap = await getEvidenceMapForPackVersion(story.packVersionId);
        const acIds = story.acceptanceCriteria.map((ac) => ac.id);
        const evidenceSummary = getEvidenceSummaryForStory(
          evidenceMap,
          story.id,
          acIds
        );

        const summary = mondayApi.buildStoryTitle(
          story.persona,
          story.want,
          story.soThat
        );
        const acLines = story.acceptanceCriteria
          .map(
            (ac) =>
              `* Given: ${ac.given}\n* When: ${ac.when}\n* Then: ${ac.then}`
          )
          .join("\n\n");
        const description = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Evidence: ${evidenceSummary}` }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Acceptance criteria:" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: acLines }],
            },
          ],
        };

        await updateJiraIssue(client, exportRecord.externalId, {
          summary,
          description,
        });

        await db.storyExport.update({
          where: { id: exportRecord.id },
          data: { lastSyncedAt: new Date(), changedSincePush: false },
        });
      } else {
        const conn = await db.mondayConnection.findUnique({
          where: { workspaceId: ctx.workspaceId },
        });
        if (!conn) throw new Error("Monday.com not connected");

        const mapping = (conn.fieldMapping ?? {}) as FieldMapping;
        const evidenceMap = await getEvidenceMapForPackVersion(story.packVersionId);
        const acIds = story.acceptanceCriteria.map((ac) => ac.id);
        const evidenceSummary = getEvidenceSummaryForStory(
          evidenceMap,
          story.id,
          acIds
        );

        const columnValues = mondayApi.buildColumnValues(mapping, {
          persona: story.persona,
          want: story.want,
          soThat: story.soThat,
          evidence: evidenceSummary,
          storyId: story.id,
        });

        await mondayApi.changeMultipleColumnValues(
          conn.accessToken,
          conn.mondayBoardId,
          exportRecord.externalId,
          columnValues
        );

        await db.storyExport.update({
          where: { id: exportRecord.id },
          data: { lastSyncedAt: new Date(), changedSincePush: false },
        });
      }

      await db.deliveryFeedback.updateMany({
        where: {
          storyId: input.storyId,
          isResolved: false,
        },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.userId,
          resolutionNote: `Story updated and pushed to ${input.targetSystem}`,
        },
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: story.packVersion.pack.id },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "storyExport.pushUpdate",
        entityType: "Story",
        entityId: input.storyId,
        metadata: { targetSystem: input.targetSystem },
      });

      return { success: true };
    }),
});
