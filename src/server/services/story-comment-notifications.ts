/**
 * Notifications for story comments: @mentions and replies.
 * Respects NotificationPreference.notifyMentions and notifyReplies.
 */
import { db } from "../db";
import { createImmediateEmailNotification } from "./notifications";

const DEFAULT_NOTIFY_MENTIONS = true;
const DEFAULT_NOTIFY_REPLIES = true;

export async function createStoryCommentNotifications(params: {
  comment: { id: string; content: string; mentions: string[]; parentId: string | null };
  authorId: string;
  packId: string;
  projectId: string;
  storyId: string;
  workspaceId: string;
  isReply: boolean;
}): Promise<void> {
  const { comment, authorId, packId, projectId, storyId, workspaceId, isReply } = params;
  const link = `/workspace/${workspaceId}/projects/${projectId}/packs/${packId}?story=${storyId}`;

  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });

  const prefs = await db.notificationPreference.findMany({
    where: {
      workspaceId,
      userId: { in: members.map((m) => m.userId) },
    },
    select: {
      userId: true,
      notifyMentions: true,
      notifyReplies: true,
    },
  });

  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  const mentionedUserIds = [...new Set(comment.mentions)].filter((id) => id !== authorId);
  const notifyUserIds = new Set<string>();

  if (isReply) {
    const parentComment = comment.parentId
      ? await db.storyComment.findUnique({
          where: { id: comment.parentId },
          select: { createdBy: true },
        })
      : null;
    const replyToUserId = parentComment?.createdBy;
    if (replyToUserId && replyToUserId !== authorId) {
      const pref = prefByUser.get(replyToUserId);
      const enabled = pref?.notifyReplies ?? DEFAULT_NOTIFY_REPLIES;
      if (enabled) notifyUserIds.add(replyToUserId);
    }
  }

  for (const userId of mentionedUserIds) {
    const pref = prefByUser.get(userId);
    const enabled = pref?.notifyMentions ?? DEFAULT_NOTIFY_MENTIONS;
    if (enabled) notifyUserIds.add(userId);
  }

  if (notifyUserIds.size === 0) return;

  const type = isReply ? "story_reply" : "story_mention";
  const title = isReply
    ? "Someone replied to a story comment"
    : "You were mentioned in a story comment";
  const body = comment.content.slice(0, 200) + (comment.content.length > 200 ? "…" : "");

  await db.notification.createMany({
    data: [...notifyUserIds].map((userId) => ({
      workspaceId,
      userId,
      type,
      title,
      body,
      link,
      relatedPackId: packId,
    })),
  });

  for (const userId of notifyUserIds) {
    await createImmediateEmailNotification(userId, workspaceId, {
      title,
      body,
      link,
    });
  }
}
