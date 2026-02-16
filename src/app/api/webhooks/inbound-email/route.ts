/**
 * Inbound email webhook for SendGrid (and optionally Resend).
 * Receives multipart/form-data, validates signature, emits email/inbound.received.
 */
import { NextResponse } from "next/server";
import { inngest } from "@/server/inngest/client";
import { env } from "@/lib/env";
import { webhookLimit } from "@/lib/rate-limit";
import crypto from "crypto";

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

function verifySendGridSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null
): boolean {
  const secret = env.SENDGRID_WEBHOOK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const payload = timestamp + rawBody;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateResult = await webhookLimit(ip);
    if (!rateResult.success) {
      const retryAfter = Math.max(1, rateResult.reset - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 }
      );
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request too large" },
        { status: 413 }
      );
    }

    const sigHeader = request.headers.get("x-twilio-email-event-webhook-signature");
    const sigTimestamp = request.headers.get("x-twilio-email-event-webhook-timestamp");
    if (env.SENDGRID_WEBHOOK_SECRET && sigHeader && sigTimestamp) {
      const rawBody = await request.clone().text();
      if (!verifySendGridSignature(rawBody, sigHeader, sigTimestamp)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const formData = await request.formData();
    const from = (formData.get("from") as string) ?? "";
    const to = (formData.get("to") as string) ?? "";
    const subject = (formData.get("subject") as string) ?? "";
    const text = (formData.get("text") as string) ?? "";
    const html = (formData.get("html") as string) ?? "";

    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (value instanceof Blob && value.size > 0) {
        const filename = (value as File).name || `attachment-${key}`;
        const buf = Buffer.from(await value.arrayBuffer());
        const contentType = value.type || "application/octet-stream";
        attachments.push({
          filename: filename || `attachment-${key}`,
          content: buf,
          contentType,
        });
      }
    }

    try {
      await inngest.send({
        name: "email/inbound.received",
        data: {
          from,
          to,
          subject,
          text,
          html,
          attachments,
        },
      });
    } catch (emitErr) {
      console.error("[inbound-email] Inngest emit failed:", emitErr);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[inbound-email] webhook error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
