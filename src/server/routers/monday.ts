import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import * as mondayApi from "../integrations/monday";
import {
  getEvidenceMapForPackVersion,
  getEvidenceSummaryForStory,
} from "../services/pack";
import type { FieldMapping } from "../integrations/monday";

export const mondayRouter = router({
  connect: workspaceProcedure
    .input(
      z.object({
        apiToken: z.string().min(1),
        boardId: z.string(),
        groupId: z.string(),
        fieldMapping: z
          .object({
            personaColumnId: z.string().optional(),
            wantColumnId: z.string().optional(),
            soThatColumnId: z.string().optional(),
            evidenceColumnId: z.string().optional(),
            storyIdColumnId: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await mondayApi.listBoards(input.apiToken);
      const groups = await mondayApi.listGroups(input.apiToken, input.boardId);
      const groupExists = groups.some((g) => g.id === input.groupId);
      if (!groupExists) {
        throw new Error("Group not found on board");
      }
      await db.mondayConnection.upsert({
        where: { workspaceId: ctx.workspaceId },
        create: {
          workspaceId: ctx.workspaceId,
          mondayBoardId: input.boardId,
          mondayGroupId: input.groupId,
          accessToken: input.apiToken,
          connectedAt: new Date(),
          connectedBy: ctx.userId,
          fieldMapping: (input.fieldMapping ?? {}) as object,
        },
        update: {
          mondayBoardId: input.boardId,
          mondayGroupId: input.groupId,
          accessToken: input.apiToken,
          connectedAt: new Date(),
          connectedBy: ctx.userId,
          fieldMapping: (input.fieldMapping ?? {}) as object,
        },
      });
      return { connected: true };
    }),

  disconnect: workspaceProcedure.mutation(async ({ ctx }) => {
    await db.mondayConnection.deleteMany({
      where: { workspaceId: ctx.workspaceId },
    });
    return { disconnected: true };
  }),

  getConnection: workspaceProcedure.query(async ({ ctx }) => {
    const conn = await db.mondayConnection.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });
    if (!conn) return null;
    return {
      boardId: conn.mondayBoardId,
      groupId: conn.mondayGroupId,
      fieldMapping: (conn.fieldMapping ?? {}) as FieldMapping,
      connectedAt: conn.connectedAt,
    };
  }),

  listBoards: workspaceProcedure
    .input(z.object({ apiToken: z.string().min(1) }))
    .query(async ({ input }) => {
      return mondayApi.listBoards(input.apiToken);
    }),

  listGroups: workspaceProcedure
    .input(
      z.object({
        apiToken: z.string().min(1),
        boardId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return mondayApi.listGroups(input.apiToken, input.boardId);
    }),

  listColumns: workspaceProcedure
    .input(
      z.object({
        apiToken: z.string().min(1),
        boardId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return mondayApi.listColumns(input.apiToken, input.boardId);
    }),

  push: workspaceProcedure
    .input(
      z.object({
        packVersionId: z.string(),
        storyIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await db.mondayConnection.findUnique({
        where: { workspaceId: ctx.workspaceId },
      });
      if (!conn)
        throw new Error("Monday.com not connected. Connect in workspace settings.");

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
      const mapping = (conn.fieldMapping ?? {}) as FieldMapping;
      const results: Array<{
        storyId: string;
        mondayItemId?: string;
        error?: string;
        status: "success" | "failed" | "skipped";
      }> = [];

      for (const story of version.stories) {
        const acIds = story.acceptanceCriteria.map((ac) => ac.id);
        const evidenceSummary = getEvidenceSummaryForStory(
          evidenceMap,
          story.id,
          acIds
        );
        const itemTitle = mondayApi.buildStoryTitle(
          story.persona,
          story.want,
          story.soThat
        );
        const columnValues = mondayApi.buildColumnValues(mapping, {
          persona: story.persona,
          want: story.want,
          soThat: story.soThat,
          evidence: evidenceSummary,
          storyId: story.id,
        });

        const existingPush = await db.mondayPushLog.findFirst({
          where: {
            storyId: story.id,
            packVersionId: input.packVersionId,
            status: "success",
            mondayItemId: { not: "failed" },
          },
          orderBy: { pushedAt: "desc" },
        });

        try {
          if (existingPush && existingPush.mondayItemId) {
            await mondayApi.changeMultipleColumnValues(
              conn.accessToken,
              conn.mondayBoardId,
              existingPush.mondayItemId,
              columnValues
            );
            await db.mondayPushLog.create({
              data: {
                packVersionId: input.packVersionId,
                storyId: story.id,
                mondayItemId: existingPush.mondayItemId,
                pushedAt: new Date(),
                pushedBy: ctx.userId,
                status: "success",
              },
            });
            results.push({
              storyId: story.id,
              mondayItemId: existingPush.mondayItemId,
              status: "success",
            });
          } else {
            const mondayItemId = await mondayApi.createItem(
              conn.accessToken,
              conn.mondayBoardId,
              conn.mondayGroupId,
              itemTitle,
              Object.keys(columnValues).length > 0 ? columnValues : undefined
            );

            for (const ac of story.acceptanceCriteria) {
              const acName = `Given ${ac.given} When ${ac.when} Then ${ac.then}`;
              await mondayApi.createSubitem(
                conn.accessToken,
                mondayItemId,
                acName.length > 80 ? acName.slice(0, 77) + "..." : acName
              );
            }

            await db.mondayPushLog.create({
              data: {
                packVersionId: input.packVersionId,
                storyId: story.id,
                mondayItemId,
                pushedAt: new Date(),
                pushedBy: ctx.userId,
                status: "success",
              },
            });
            results.push({ storyId: story.id, mondayItemId, status: "success" });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          await db.mondayPushLog.create({
            data: {
              packVersionId: input.packVersionId,
              storyId: story.id,
              mondayItemId: "failed",
              pushedAt: new Date(),
              pushedBy: ctx.userId,
              status: "failed",
              errorMessage: message,
            },
          });
          results.push({ storyId: story.id, error: message, status: "failed" });
        }
      }

      return { results };
    }),

  getPushHistory: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const packs = await db.pack.findMany({
        where: { projectId: input.projectId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const packIds = packs.map((p) => p.id);

      const logs = await db.mondayPushLog.findMany({
        where: {
          packVersion: { packId: { in: packIds } },
        },
        include: {
          packVersion: {
            include: {
              pack: { select: { name: true } },
            },
          },
        },
        orderBy: { pushedAt: "desc" },
        take: 50,
      });

      const byBatch = new Map<
        string,
        {
          pushedAt: Date;
          pushedBy: string;
          packName: string;
          versionNumber: number;
          success: number;
          failed: number;
          skipped: number;
        }
      >();

      for (const log of logs) {
        const batchKey = `${log.packVersionId}-${Math.floor(log.pushedAt.getTime() / 1000)}`;
        if (!byBatch.has(batchKey)) {
          byBatch.set(batchKey, {
            pushedAt: log.pushedAt,
            pushedBy: log.pushedBy,
            packName: log.packVersion.pack.name,
            versionNumber: log.packVersion.versionNumber,
            success: 0,
            failed: 0,
            skipped: 0,
          });
        }
        const batch = byBatch.get(batchKey)!;
        if (log.status === "success") batch.success++;
        else if (log.status === "failed") batch.failed++;
        else batch.skipped++;
      }

      return Array.from(byBatch.values()).sort(
        (a, b) => b.pushedAt.getTime() - a.pushedAt.getTime()
      );
    }),
});
