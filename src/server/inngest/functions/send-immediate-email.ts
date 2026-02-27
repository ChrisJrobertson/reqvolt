import { inngest } from "../client";
import { auditService } from "@/server/services/audit";
import { sendEmail, logEmailSent } from "@/server/services/email";
import {
  immediateNotificationHtml,
  immediateNotificationText,
} from "@/lib/email-templates";
import { clerkClient } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";

const RATE_LIMIT = 10;
const RATE_WINDOW_SEC = 3600;

export const sendImmediateEmail = inngest.createFunction(
  { id: "send-immediate-email", retries: 2 },
  { event: "notification/email.send" },
  async ({ event }) => {
    const { userId, workspaceId, title, body, link } = event.data as {
      userId: string;
      workspaceId: string;
      title: string;
      body: string;
      link: string;
    };

    const redis = getRedis();
    if (redis) {
      const key = `immediate-email:${userId}:${Math.floor(Date.now() / RATE_WINDOW_SEC)}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, RATE_WINDOW_SEC);
      }
      if (count > RATE_LIMIT) {
        return { status: "skipped", reason: "rate_limited" };
      }
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress;
    if (!email) {
      return { status: "skipped", reason: "no_email" };
    }

    const userName = user.firstName ?? user.username ?? "there";
    const params = {
      userName,
      title,
      body,
      actionUrl: link,
      actionLabel: "View in Reqvolt",
      workspaceId,
    };

    const result = await sendEmail({
      to: email,
      subject: title,
      html: immediateNotificationHtml(params),
      text: immediateNotificationText(params),
    });

    if (result?.id) {
      await logEmailSent({
        workspaceId,
        userId,
        recipient: email,
        subject: title,
        messageId: result.id,
      });
    }

    await auditService.log({
      workspaceId,
      userId,
      action: "immediate_email_sent",
      entityType: "User",
      entityId: userId,
    });

    return { status: "completed" };
  }
);
