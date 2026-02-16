import { inngest } from "../client";
import { db } from "@/server/db";

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
      })
    );

    return {
      status: "completed",
      deletedPackHealth,
      deletedNotifications,
    };
  }
);
