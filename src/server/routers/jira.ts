import { z } from "zod";
import { router, workspaceProcedure, adminProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { inngest } from "../inngest/client";
import {
  getJiraClient,
  createJiraIssue,
  disconnectJira,
} from "../services/jira";
import { getEvidenceMapForPackVersion, getEvidenceSummaryForStory } from "../services/pack";
import { buildStoryTitle } from "../integrations/monday";

export const jiraRouter = router({
  getConnection: workspaceProcedure.query(async ({ ctx }) => {
    const conn = await db.jiraConnection.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });
    if (!conn) return null;
    return {
      siteUrl: conn.siteUrl,
      connectedAt: conn.createdAt,
      lastSyncedAt: conn.lastSyncedAt,
      syncError: conn.syncError,
      isActive: conn.isActive,
    };
  }),

  push: workspaceProcedure
    .input(
      z.object({
        packVersionId: z.string(),
        storyIds: z.array(z.string()).min(1),
        projectKey: z.string().min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) throw new Error("Jira not connected");

      const version = await db.packVersion.findFirst({
        where: { id: input.packVersionId },
        include: {
          pack: true,
          stories: {
            where: {
              id: { in: input.storyIds },
              deletedAt: null,
            },
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

      const evidenceMap = await getEvidenceMapForPackVersion(input.packVersionId);
      const results: Array<{
        storyId: string;
        jiraKey?: string;
        jiraUrl?: string;
        status: "success" | "failed";
        error?: string;
      }> = [];

      for (const story of version.stories) {
        try {
          const acIds = story.acceptanceCriteria.map((ac) => ac.id);
          const evidenceSummary = getEvidenceSummaryForStory(
            evidenceMap,
            story.id,
            acIds
          );
          const summary = buildStoryTitle(
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
              {
                type: "paragraph" as const,
                content: [{ type: "text" as const, text: "Acceptance criteria:" }],
              },
              {
                type: "paragraph" as const,
                content: [{ type: "text" as const, text: acLines }],
              },
            ],
          };

          const { key, url } = await createJiraIssue(client, input.projectKey, {
            summary,
            description,
          });

          await db.$transaction(async (tx) => {
            await tx.storyExport.upsert({
              where: {
                storyId_externalSystem_packVersionId: {
                  storyId: story.id,
                  externalSystem: "jira",
                  packVersionId: input.packVersionId,
                },
              },
              create: {
                storyId: story.id,
                packVersionId: input.packVersionId,
                packId: version.pack.id,
                workspaceId: ctx.workspaceId,
                externalSystem: "jira",
                externalId: key,
                externalUrl: url,
                externalStatus: "To Do",
                externalStatusCategory: "in_progress",
              },
              update: {
                externalId: key,
                externalUrl: url,
                externalStatus: "To Do",
                externalStatusCategory: "in_progress",
                syncError: null,
              },
            });
          });

          results.push({
            storyId: story.id,
            jiraKey: key,
            jiraUrl: url,
            status: "success",
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          results.push({ storyId: story.id, status: "failed", error: message });
        }
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "jira.push",
        entityType: "Pack",
        entityId: version.pack.id,
        metadata: {
          packVersionId: input.packVersionId,
          storyCount: results.length,
          successCount: results.filter((r) => r.status === "success").length,
        },
      });

      return { results };
    }),

  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    await disconnectJira(ctx.workspaceId);
    await auditService.log({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "jira.disconnect",
      entityType: "JiraConnection",
    });
    return { disconnected: true };
  }),

  triggerSync: workspaceProcedure.mutation(async ({ ctx }) => {
    await inngest.send({
      name: "jira/sync.requested",
      data: { workspaceId: ctx.workspaceId },
    });
    await auditService.log({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      action: "jira.triggerSync",
      entityType: "JiraConnection",
    });
    return { triggered: true };
  }),
});
