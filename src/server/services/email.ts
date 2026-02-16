/**
 * Transactional email via Resend.
 * Falls back to console.log when RESEND_API_KEY is unset.
 */
import { Resend } from "resend";
import { db } from "../db";
import { env } from "@/lib/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const FROM = env.EMAIL_FROM;

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ id: string } | null> {
  try {
    if (!resend) {
      console.log(`[EMAIL] To: ${payload.to}, Subject: ${payload.subject}`);
      console.log(`[EMAIL] Body length: ${payload.html.length} chars`);
      return { id: "console" };
    }

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    if (error) {
      console.error("[email] Resend error:", error.message);
      return null;
    }

    const id = data?.id ?? "unknown";
    return { id };
  } catch (err) {
    console.error("[email] Send failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function sendBatchEmails(
  emails: EmailPayload[]
): Promise<{ ids: string[] }> {
  const ids: string[] = [];
  for (const email of emails) {
    const result = await sendEmail(email);
    if (result?.id) ids.push(result.id);
  }
  return { ids };
}

export async function logEmailSent(params: {
  workspaceId: string;
  userId: string;
  recipient: string;
  subject: string;
  messageId: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action: "email_sent",
        entityType: "notification",
        metadata: {
          recipient: params.recipient,
          subject: params.subject,
          messageId: params.messageId,
        },
      },
    });
  } catch (err) {
    console.error("[email] Audit log failed:", err);
  }
}
