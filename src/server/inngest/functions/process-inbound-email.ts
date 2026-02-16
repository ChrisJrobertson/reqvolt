/**
 * Process inbound email: validate sender, create Sources, handle attachments.
 * PDF/DOCX → R2 + extract-text; VTT/SRT → TRANSCRIPT + chunk-and-embed.
 * Idempotent via event id derived from payload hash.
 */
import { inngest } from "../client";
import { db } from "@/server/db";
import { putObject } from "@/lib/storage";
import { auditService } from "@/server/services/audit";
import { createNotificationsForWorkspace } from "@/server/services/notifications";
import { SourceType } from "@prisma/client";
import { randomUUID } from "crypto";
import { convert } from "html-to-text";
import {
  detectTranscriptFormat,
  parseTranscript,
  type TranscriptSegment,
} from "@/lib/transcript-parser";

const PDF_CT = "application/pdf";
const DOCX_CT =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const VTT_CT = "text/vtt";
const SRT_CT = "application/x-subrip";
const PLAIN_CT = "text/plain";

function getFileExtension(filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

function isTranscriptAttachment(
  contentType: string,
  filename: string
): boolean {
  const ext = getFileExtension(filename);
  if (["vtt", "srt"].includes(ext)) return true;
  if (contentType === VTT_CT || contentType === SRT_CT) return true;
  if (contentType === PLAIN_CT && ["vtt", "srt"].includes(ext)) return true;
  return false;
}

function isPdfOrDocx(contentType: string, filename: string): boolean {
  if (contentType === PDF_CT || contentType === DOCX_CT) return true;
  const ext = getFileExtension(filename);
  return ext === "pdf" || ext === "docx";
}

function extractTextFromHtml(html: string): string {
  if (!html || !html.trim()) return "";
  try {
    return convert(html, { wordwrap: 130 }).trim();
  } catch {
    return "";
  }
}

function transcriptToPlainText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => {
      const parts: string[] = [];
      if (s.speaker) parts.push(`${s.speaker}:`);
      if (s.timestamp) parts.push(`[${s.timestamp}]`);
      parts.push(s.text);
      return parts.join(" ");
    })
    .join("\n\n");
}

export const processInboundEmail = inngest.createFunction(
  {
    id: "process-inbound-email",
    retries: 2,
  },
  { event: "email/inbound.received" },
  async ({ event, step }) => {
    const { from, to, subject, text, html, attachments } = event.data as {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      attachments: { filename: string; content: Buffer; contentType: string }[];
    };

    const toPart = to.split(",")[0]?.trim() ?? "";
    const forwardingEmail = toPart.replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase() || toPart.toLowerCase();
    if (!forwardingEmail) {
      return { status: "skipped", reason: "no_recipient" };
    }

    const project = await db.project.findFirst({
      where: {
        forwardingEmail: { equals: forwardingEmail, mode: "insensitive" },
      },
      include: { workspace: true },
    });

    if (!project) {
      return { status: "skipped", reason: "unknown_forwarding_address" };
    }

    const { workspaceId } = project;

    const senderEmail = from.replace(/^.*<([^>]+)>.*$/, "$1").trim().toLowerCase();
    const member = await db.workspaceMember.findFirst({
      where: {
        workspaceId,
        email: { equals: senderEmail, mode: "insensitive" },
      },
    });

    if (!member) {
      return { status: "skipped", reason: "sender_not_in_workspace" };
    }

    const bodyText = (text || extractTextFromHtml(html)).trim();
    const sourceIds: string[] = [];

    if (bodyText.length >= 10) {
      const emailSource = await db.source.create({
        data: {
          workspaceId,
          projectId: project.id,
          type: SourceType.EMAIL,
          name: subject || "(No subject)",
          content: bodyText,
          metadata: { subject, from, to },
          status: "completed",
        },
      });
      sourceIds.push(emailSource.id);

      await step.sendEvent("chunk-email", {
        name: "source/chunk-and-embed",
        data: {
          sourceId: emailSource.id,
          workspaceId,
          projectId: project.id,
        },
      });

      await auditService.log({
        workspaceId,
        userId: member.userId,
        action: "source.create",
        entityType: "Source",
        entityId: emailSource.id,
        metadata: { type: "email", subject },
      });
    }

    for (const att of attachments) {
      const { filename, content, contentType } = att;

      if (isTranscriptAttachment(contentType, filename)) {
        const raw = content.toString("utf-8");
        const format = detectTranscriptFormat(raw, getFileExtension(filename));
        const segments = parseTranscript(raw, format);
        const plainText = transcriptToPlainText(segments);

        if (plainText.length < 10) continue;

        const transcriptSource = await db.source.create({
          data: {
            workspaceId,
            projectId: project.id,
            type: SourceType.TRANSCRIPT,
            name: filename,
            content: plainText,
            metadata: { filename, format },
            status: "completed",
          },
        });
        sourceIds.push(transcriptSource.id);

        await step.sendEvent("chunk-transcript", {
          name: "source/chunk-and-embed",
          data: {
            sourceId: transcriptSource.id,
            workspaceId,
            projectId: project.id,
          },
        });

        await auditService.log({
          workspaceId,
          userId: member.userId,
          action: "source.create",
          entityType: "Source",
          entityId: transcriptSource.id,
          metadata: { type: "transcript", filename },
        });
      } else if (isPdfOrDocx(contentType, filename)) {
        const objectKey = `uploads/${workspaceId}/${randomUUID()}/${filename}`;
        await putObject(objectKey, content, contentType);

        const sourceType =
          contentType === PDF_CT || getFileExtension(filename) === "pdf"
            ? SourceType.PDF
            : SourceType.DOCX;

        const fileSource = await db.source.create({
          data: {
            workspaceId,
            projectId: project.id,
            type: sourceType,
            name: filename,
            content: "",
            metadata: { objectKey },
            status: "pending",
          },
        });
        sourceIds.push(fileSource.id);

        await step.sendEvent("extract-file", {
          name: "source/extract-text",
          data: {
            sourceId: fileSource.id,
            objectKey,
            workspaceId,
          },
        });

        await auditService.log({
          workspaceId,
          userId: member.userId,
          action: "source.create",
          entityType: "Source",
          entityId: fileSource.id,
          metadata: { type: "file", objectKey, filename },
        });
      }
    }

    if (sourceIds.length > 0) {
      await createNotificationsForWorkspace({
        workspaceId,
        type: "email_ingested",
        title: "Email ingested",
        body: `New sources added from email: ${subject || "(No subject)"}`,
        link: `/workspace/${workspaceId}/projects/${project.id}`,
        relatedSourceId: sourceIds[0],
        preferenceKey: "notifyEmailIngested",
      });
    }

    return {
      status: "completed",
      projectId: project.id,
      sourceIds,
    };
  }
);
