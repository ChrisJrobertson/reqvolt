import { inngest } from "../client";
import { db } from "@/server/db";
import { applyRetentionPolicy, purgeExpiredProjects } from "@/server/services/retention";

const PACK_HEALTH_RETENTION_DAYS = 90;
const NOTIFICATION_READ_RETENTION_DAYS = 30;
const NOTIFICATION_UNREAD_RETENTION_DAYS = 90;

export const cleanupOldData = inngest.createFunction(
  { id: "cleanup-old-data", retries: 2 },
  { cron: "0 3 * * 0" },
  async () => {
    const packHealthCutoff = new Date();
    packHealthCutoff.setDate(packHealthCutoff.getDate() - PACK_HEALTH_RETENTION_DAYS);

    const readNotificationCutoff = new Date();
    readNotificationCutoff.setDate(readNotificationCutoff.getDate() - NOTIFICATION_READ_RETENTION_DAYS);

    const unreadNotificationCutoff = new Date();
    unreadNotificationCutoff.setDate(
      unreadNotificationCutoff.getDate() - NOTIFICATION_UNREAD_RETENTION_DAYS
    );

    const workspacesWithRetention = await db.workspace.findMany({
      where: { retentionEnabled: true },
      select: { id: true },
    });

    let archivedCount = 0;
    let purgedCount = 0;
    for (const ws of workspacesWithRetention) {
      archivedCount += await applyRetentionPolicy(ws.id);
      purgedCount += await purgeExpiredProjects(ws.id);
    }

    const [packHealthResult, readNotificationsResult, unreadNotificationsResult] =
      await Promise.all([
        db.packHealth.deleteMany({
          where: { computedAt: { lt: packHealthCutoff } },
        }),
        db.notification.deleteMany({
          where: {
            isRead: true,
            createdAt: { lt: readNotificationCutoff },
          },
        }),
        db.notification.deleteMany({
          where: {
            isRead: false,
            createdAt: { lt: unreadNotificationCutoff },
          },
        }),
      ]);

    const deletedPackHealth = packHealthResult.count;
    const deletedNotifications =
      readNotificationsResult.count + unreadNotificationsResult.count;

    console.log(
      JSON.stringify({
        action: "data_cleanup",
        deletedPackHealth,
        deletedNotifications,
        archivedProjects: archivedCount,
        purgedProjects: purgedCount,
      })
    );

    return {
      status: "completed",
      deletedPackHealth,
      deletedNotifications,
      archivedProjects: archivedCount,
      purgedProjects: purgedCount,
    };
  }
);
