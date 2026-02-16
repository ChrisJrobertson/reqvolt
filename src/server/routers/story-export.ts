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
          data: { lastSyncedAt: new Date() },
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
