import { inngest } from "../client";
import { db } from "@/server/db";
import { getItemsWithStatusAndUpdates } from "@/server/integrations/monday";
import { createNotificationsForWorkspace } from "@/server/services/notifications";

const BATCH_SIZE = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function matchSignalWords(
  text: string,
  signalWords: string[]
): string[] {
  if (signalWords.length === 0) return [];
  const regex = new RegExp(
    `\\b(${signalWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi"
  );
  const matches = text.match(regex);
  return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}

export const syncMondayFeedback = inngest.createFunction(
  {
    id: "sync-monday-feedback",
    retries: 3,
  },
  [
    { cron: "*/15 * * * *" },
    { event: "story-export/sync.requested" },
  ],
  async ({ event }) => {
    const isCron = event.name !== "story-export/sync.requested";
    const eventData = event.data as {
      packId?: string;
      workspaceId?: string;
      externalSystem?: string;
    };

    if (!isCron && eventData.externalSystem && eventData.externalSystem !== "monday") {
      return { status: "skipped", reason: "wrong_system" };
    }

    const connections = await db.mondayConnection.findMany({
      select: { workspaceId: true, accessToken: true, mondayBoardId: true, fieldMapping: true },
    });

    if (connections.length === 0) {
      return { status: "skipped", reason: "no_connections" };
    }

    let processed = 0;
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

    for (const conn of connections) {
      const exportWhere: {
        workspaceId: string;
        externalSystem: string;
        pack: { reviewStatus: object; id?: string };
        OR: Array<{ syncError: null } | { lastSyncedAt: object }>;
      } = {
        workspaceId: conn.workspaceId,
        externalSystem: "monday",
        pack: { reviewStatus: { not: "locked" } },
        OR: [
          { syncError: null },
          { lastSyncedAt: { lt: oneHourAgo } },
        ],
      };

      if (!isCron && eventData.packId) {
        exportWhere.pack = { id: eventData.packId, reviewStatus: { not: "locked" } };
      }

      const exports = await db.storyExport.findMany({
        where: exportWhere,
        include: {
          pack: true,
          story: { select: { want: true } },
        },
      });

      if (exports.length === 0) continue;

      const workspace = await db.workspace.findFirst({
        where: { id: conn.workspaceId },
        select: { mondayRejectionStatuses: true, jiraSignalWords: true },
      });

      const rejectionStatuses = workspace?.mondayRejectionStatuses ?? ["Stuck", "Rejected"];
      const signalWords = workspace?.jiraSignalWords ?? [
        "unclear", "ambiguous", "question", "assumption", "wrong", "missing",
        "confused", "what does", "what do you mean",
      ];
      const mapping = (conn.fieldMapping ?? {}) as { statusColumnId?: string };
      const statusColumnId = mapping.statusColumnId;

      if (!statusColumnId) {
        console.warn(`[sync-monday] Workspace ${conn.workspaceId}: statusColumnId not configured, skipping status sync`);
      }

      const itemIds = exports.map((e) => e.externalId);
      const batches: string[][] = [];
      for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
        batches.push(itemIds.slice(i, i + BATCH_SIZE));
      }

      const newFeedbackPackIds = new Set<string>();

      for (const batch of batches) {
        try {
          const items = await getItemsWithStatusAndUpdates(
            conn.accessToken,
            conn.mondayBoardId,
            batch,
            10
          );

          const statusByColumnId = statusColumnId
            ? new Map<string, string>()
            : null;
          if (statusColumnId) {
            for (const item of items) {
              const cv = item.column_values.find((c) => c.id === statusColumnId);
              if (cv?.text) statusByColumnId!.set(item.id, cv.text);
            }
          }

          for (const item of items) {
            const exportRecord = exports.find((e) => e.externalId === item.id);
            if (!exportRecord) continue;

            const statusText = statusColumnId
              ? statusByColumnId?.get(item.id) ?? null
              : null;

            let category: "rejected" | "done" | "in_progress" = "in_progress";
            if (statusText) {
              if (rejectionStatuses.some((r) => r.toLowerCase() === statusText.toLowerCase())) {
                category = "rejected";
              } else if (
                statusText.toLowerCase() === "done" ||
                statusText.toLowerCase() === "closed"
              ) {
                category = "done";
              }
            }

            const previousStatus = exportRecord.externalStatus;
            const previousCategory = exportRecord.externalStatusCategory;

            await db.$transaction(async (tx) => {
              if (statusText && statusText !== previousStatus) {
                const existingRejection = await tx.deliveryFeedback.findFirst({
                  where: {
                    storyExportId: exportRecord.id,
                    feedbackType: "rejection",
                    content: { contains: statusText },
                  },
                });

                if (!existingRejection && category === "rejected") {
                  await tx.deliveryFeedback.create({
                    data: {
                      storyExportId: exportRecord.id,
                      storyId: exportRecord.storyId,
                      packId: exportRecord.packId,
                      feedbackType: "rejection",
                      content: `Status changed to '${statusText}'`,
                      externalCreatedAt: new Date(),
                      matchedSignalWords: [],
                    },
                  });
                  newFeedbackPackIds.add(exportRecord.packId);
                }

                if (previousCategory !== category) {
                  await tx.deliveryFeedback.create({
                    data: {
                      storyExportId: exportRecord.id,
                      storyId: exportRecord.storyId,
                      packId: exportRecord.packId,
                      feedbackType: "status_change",
                      content: `Status changed to '${statusText}'`,
                      externalCreatedAt: new Date(),
                      matchedSignalWords: [],
                    },
                  });
                  newFeedbackPackIds.add(exportRecord.packId);
                }
              }

              const lastSynced = exportRecord.lastSyncedAt;

              for (const update of item.updates ?? []) {
                const createdAt = new Date(update.created_at);
                if (lastSynced && createdAt <= lastSynced) continue;

                const bodyText = update.text_body ?? stripHtml(update.body);
                const matched = matchSignalWords(bodyText, signalWords);

                if (matched.length > 0) {
                  const existing = await tx.deliveryFeedback.findFirst({
                    where: {
                      storyExportId: exportRecord.id,
                      content: bodyText.slice(0, 500),
                    },
                  });
                  if (!existing) {
                    await tx.deliveryFeedback.create({
                      data: {
                        storyExportId: exportRecord.id,
                        storyId: exportRecord.storyId,
                        packId: exportRecord.packId,
                        feedbackType: "question",
                        externalAuthor: update.creator?.name ?? null,
                        content: bodyText,
                        externalCreatedAt: createdAt,
                        matchedSignalWords: matched,
                      },
                    });
                    newFeedbackPackIds.add(exportRecord.packId);
                  }
                }
              }

              await tx.storyExport.update({
                where: { id: exportRecord.id },
                data: {
                  externalStatus: statusText,
                  externalStatusCategory: category,
                  lastSyncedAt: new Date(),
                  syncError: null,
                },
              });
            });

            processed++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          for (const e of exports.filter((ex) => batch.includes(ex.externalId))) {
            await db.storyExport.update({
              where: { id: e.id },
              data: { syncError: message },
            });
          }
          console.error("[sync-monday] API error:", err);
        }
      }

      if (newFeedbackPackIds.size > 0) {
        for (const packId of newFeedbackPackIds) {
          await inngest.send({
            name: "pack/health.recompute",
            data: { packId },
          });
        }

        for (const packId of newFeedbackPackIds) {
          const pack = await db.pack.findFirst({
            where: { id: packId },
            select: { name: true, projectId: true },
          });
          if (!pack) continue;

          await createNotificationsForWorkspace({
            workspaceId: conn.workspaceId,
            type: "delivery_feedback",
            title: `Feedback from Monday.com on ${pack.name}`,
            body: "New feedback from Monday.com",
            link: `/workspace/${conn.workspaceId}/projects/${pack.projectId}/packs/${packId}`,
            relatedPackId: packId,
            preferenceKey: "notifyDeliveryFeedback",
          });
        }
      }
    }

    return { status: "completed", processed };
  }
);
