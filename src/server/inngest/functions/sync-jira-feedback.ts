/**
 * Jira feedback sync. Status changes and signal-word comments → DeliveryFeedback.
 */
import { inngest } from "../client";
import { db } from "@/server/db";
import {
  getJiraClient,
  searchJiraIssues,
} from "@/server/services/jira";
import { createNotificationsForWorkspace } from "@/server/services/notifications";

const BATCH_SIZE = 50;
const ONE_HOUR_MS = 60 * 60 * 1000;

function stripJiraAdf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const obj = content as { content?: Array<{ text?: string; content?: unknown[] }> };
  if (!Array.isArray(obj.content)) return "";
  const parts: string[] = [];
  for (const node of obj.content) {
    if (node.text) parts.push(node.text);
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (typeof child === "object" && child !== null && "text" in child) {
          parts.push((child as { text: string }).text);
        }
      }
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function matchSignalWords(text: string, signalWords: string[]): string[] {
  if (signalWords.length === 0) return [];
  const regex = new RegExp(
    `\\b(${signalWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "gi"
  );
  const matches = text.match(regex);
  return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}

export const syncJiraFeedback = inngest.createFunction(
  {
    id: "sync-jira-feedback",
    retries: 3,
  },
  [
    { cron: "*/15 * * * *" },
    { event: "jira/sync.requested" },
    { event: "story-export/sync.requested" },
  ],
  async ({ event }) => {
    const eventData = event.data as {
      packId?: string;
      workspaceId?: string;
      externalSystem?: string;
    };

    if (
      event.name === "story-export/sync.requested" &&
      eventData.externalSystem &&
      eventData.externalSystem !== "jira"
    ) {
      return { status: "skipped", reason: "wrong_system" };
    }

    const connections = await db.jiraConnection.findMany({
      where: { isActive: true },
      select: { id: true, workspaceId: true },
    });

    if (connections.length === 0) {
      return { status: "skipped", reason: "no_connections" };
    }

    let processed = 0;
    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

    for (const conn of connections) {
      let client;
      try {
        client = await getJiraClient(conn.workspaceId);
      } catch (err) {
        console.error(`[sync-jira] Token refresh failed for ${conn.workspaceId}:`, err);
        continue;
      }
      if (!client) continue;

      const exportWhere: {
        workspaceId: string;
        externalSystem: string;
        pack: { reviewStatus: object; id?: string };
        OR: Array<{ syncError: null } | { lastSyncedAt: object }>;
      } = {
        workspaceId: conn.workspaceId,
        externalSystem: "jira",
        pack: { reviewStatus: { not: "locked" } },
        OR: [
          { syncError: null },
          { lastSyncedAt: { lt: oneHourAgo } },
        ],
      };

      if (eventData.packId) {
        exportWhere.pack = { id: eventData.packId, reviewStatus: { not: "locked" } };
      }

      const exports = await db.storyExport.findMany({
        where: exportWhere,
        include: { pack: true, story: { select: { want: true } } },
      });

      if (exports.length === 0) continue;

      const workspace = await db.workspace.findFirst({
        where: { id: conn.workspaceId },
        select: { jiraRejectionStatuses: true, jiraSignalWords: true },
      });

      const rejectionStatuses = workspace?.jiraRejectionStatuses ?? [
        "Rejected",
        "Won't Do",
        "Cancelled",
      ];
      const signalWords = workspace?.jiraSignalWords ?? [
        "unclear",
        "ambiguous",
        "question",
        "assumption",
        "wrong",
        "missing",
        "confused",
        "what does",
        "what do you mean",
      ];

      const keys = exports.map((e) => e.externalId);
      const batches: string[][] = [];
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        batches.push(keys.slice(i, i + BATCH_SIZE));
      }

      const newFeedbackPackIds = new Set<string>();

      for (const batch of batches) {
        try {
          const jql = `key IN (${batch.map((k) => `"${k}"`).join(",")})`;
          const issues = await searchJiraIssues(client, jql, [
            "status",
            "comment",
          ]);

          for (const issue of issues) {
            const exportRecord = exports.find((e) => e.externalId === issue.key);
            if (!exportRecord) continue;

            const statusName = issue.fields?.status?.name ?? null;
            let category: "rejected" | "done" | "in_progress" = "in_progress";
            if (statusName) {
              if (
                rejectionStatuses.some(
                  (r) => r.toLowerCase() === statusName.toLowerCase()
                )
              ) {
                category = "rejected";
              } else if (
                statusName.toLowerCase() === "done" ||
                statusName.toLowerCase() === "closed"
              ) {
                category = "done";
              }
            }

            const previousStatus = exportRecord.externalStatus;
            const previousCategory = exportRecord.externalStatusCategory;
            const comments = (issue.fields?.comment as { comments?: Array<{
              id: string;
              body?: { content?: unknown };
              created?: string;
              author?: { displayName?: string };
            }> })?.comments ?? [];
            const lastSynced = exportRecord.lastSyncedAt;

            await db.$transaction(async (tx) => {
              if (statusName && statusName !== previousStatus) {
                const existingRejection = await tx.deliveryFeedback.findFirst({
                  where: {
                    storyExportId: exportRecord.id,
                    feedbackType: "rejection",
                    content: { contains: statusName },
                  },
                });

                if (!existingRejection && category === "rejected") {
                  await tx.deliveryFeedback.create({
                    data: {
                      storyExportId: exportRecord.id,
                      storyId: exportRecord.storyId,
                      packId: exportRecord.packId,
                      feedbackType: "rejection",
                      content: `Status changed to '${statusName}'`,
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
                      content: `Status changed to '${statusName}'`,
                      externalCreatedAt: new Date(),
                      matchedSignalWords: [],
                    },
                  });
                  newFeedbackPackIds.add(exportRecord.packId);
                }
              }

              for (const comment of comments) {
                const createdAt = comment.created
                  ? new Date(comment.created)
                  : new Date();
                if (lastSynced && createdAt <= lastSynced) continue;

                const bodyText = stripJiraAdf(comment.body?.content ?? comment.body);
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
                        externalAuthor: comment.author?.displayName ?? null,
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
                  externalStatus: statusName,
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
          if (message.includes("401")) {
            await db.jiraConnection.update({
              where: { id: conn.id },
              data: { isActive: false, syncError: "Token expired or revoked" },
            });
          }
          const batchKeys = new Set(batch);
          for (const e of exports.filter((ex) => batchKeys.has(ex.externalId))) {
            await db.storyExport.update({
              where: { id: e.id },
              data: { syncError: message.slice(0, 500) },
            });
          }
          console.error("[sync-jira] API error:", err);
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
            title: `Feedback from Jira on ${pack.name}`,
            body: "New feedback from Jira",
            link: `/workspace/${conn.workspaceId}/projects/${pack.projectId}/packs/${packId}`,
            relatedPackId: packId,
            preferenceKey: "notifyDeliveryFeedback",
          });
        }
      }

      await db.jiraConnection.update({
        where: { id: conn.id },
        data: { lastSyncedAt: new Date(), syncError: null },
      });
    }

    return { status: "completed", processed };
  }
);
