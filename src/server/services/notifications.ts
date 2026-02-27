/**
 * Notification creation helper.
 * Standardises notification logic across Inngest functions.
 */
import { db } from "../db";
import { inngest } from "../inngest/client";
import { getRedis } from "@/lib/redis";

export type NotificationType =
  | "source_changed"
  | "source_relevant"
  | "delivery_feedback"
  | "health_degraded"
  | "email_ingested"
  | "sync_error"
  | "change_request_created";

export type PreferenceKey =
  | "notifySourceChanges"
  | "notifyDeliveryFeedback"
  | "notifyHealthDegraded"
  | "notifyEmailIngested";

export interface CreateNotificationParams {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  relatedPackId?: string;
  relatedSourceId?: string;
  preferenceKey: PreferenceKey;
}

const DEFAULT_PREFERENCES = {
  notifySourceChanges: true,
  notifyDeliveryFeedback: true,
  notifyHealthDegraded: true,
  notifyEmailIngested: true,
};

export async function createNotificationsForWorkspace(
  params: CreateNotificationParams
): Promise<number> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: params.workspaceId },
    select: { userId: true },
  });

  if (members.length === 0) return 0;

  const prefs = await db.notificationPreference.findMany({
    where: {
      workspaceId: params.workspaceId,
      userId: { in: members.map((m) => m.userId) },
    },
    select: {
      userId: true,
      notifySourceChanges: true,
      notifyDeliveryFeedback: true,
      notifyHealthDegraded: true,
      notifyEmailIngested: true,
    },
  });

  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
  const eligibleUserIds: string[] = [];

  for (const member of members) {
    const pref = prefByUser.get(member.userId);
    const enabled =
      pref?.[params.preferenceKey] ?? DEFAULT_PREFERENCES[params.preferenceKey];
    if (enabled) {
      eligibleUserIds.push(member.userId);
    }
  }

  if (eligibleUserIds.length === 0) return 0;

  await db.notification.createMany({
    data: eligibleUserIds.map((userId) => ({
      workspaceId: params.workspaceId,
      userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
      relatedPackId: params.relatedPackId ?? null,
      relatedSourceId: params.relatedSourceId ?? null,
    })),
  });

  for (const userId of eligibleUserIds) {
    if (params.link) {
      await createImmediateEmailNotification(userId, params.workspaceId, {
        title: params.title,
        body: params.body ?? "",
        link: params.link,
      });
    }
  }

  return eligibleUserIds.length;
}

const IMMEDIATE_EMAIL_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_SEC = 3600; // 1 hour

export async function createImmediateEmailNotification(
  userId: string,
  workspaceId: string,
  notification: { title: string; body: string; link: string }
): Promise<void> {
  const pref = await db.notificationPreference.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    select: { emailFrequency: true },
  });

  if (pref?.emailFrequency !== "immediate") return;

  const redis = getRedis();
  if (redis) {
    const key = `immediate-email:${userId}:${Math.floor(Date.now() / RATE_LIMIT_WINDOW_SEC)}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SEC);
    }
    if (count > IMMEDIATE_EMAIL_RATE_LIMIT) return;
  }

  await inngest.send({
    name: "notification/email.send",
    data: {
      userId,
      workspaceId,
      title: notification.title,
      body: notification.body,
      link: notification.link,
    },
  });
}
