import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import {
  createPresignedUpload,
  headObject,
} from "@/lib/storage";
import { inngest } from "../inngest/client";
import { auditService } from "../services/audit";
import { SourceType } from "@prisma/client";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const uploadRouter = router({
  requestUploadUrl: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        fileName: z.string().min(1),
        contentType: z.string(),
        sizeBytes: z.number().positive().max(50 * 1024 * 1024),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_CONTENT_TYPES.includes(input.contentType)) {
        throw new Error("Unsupported file type. Allowed: PDF, DOCX");
      }

      const { uploadUrl, objectKey } = await createPresignedUpload({
        workspaceId: ctx.workspaceId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      });

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const session = await db.uploadSession.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          objectKey,
          expectedSize: BigInt(input.sizeBytes),
          expectedContentType: input.contentType,
          expiresAt,
        },
      });

      return {
        uploadUrl,
        objectKey,
        sessionId: session.id,
        projectId: input.projectId,
      };
    }),

  confirmUpload: workspaceProcedure
    .input(
      z.object({
        sessionId: z.string(),
        objectKey: z.string(),
        projectId: z.string(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await db.uploadSession.findFirst({
        where: {
          id: input.sessionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
      });

      if (!session) throw new Error("Upload session not found");
      if (session.consumedAt) return { sourceId: "" }; // Idempotent - already processed
      if (session.expiresAt < new Date()) throw new Error("Upload session expired");
      if (session.objectKey !== input.objectKey) throw new Error("Object key mismatch");

      const head = await headObject(input.objectKey);
      if (head.contentLength > Number(session.expectedSize)) {
        throw new Error("Uploaded file exceeds expected size");
      }

      await db.uploadSession.update({
        where: { id: input.sessionId },
        data: { consumedAt: new Date() },
      });

      const sourceType =
        session.expectedContentType === "application/pdf"
          ? SourceType.PDF
          : SourceType.DOCX;

      const source = await db.source.create({
        data: {
          workspaceId: ctx.workspaceId,
          projectId: input.projectId,
          type: sourceType,
          name: input.fileName,
          content: "",
          status: "pending",
        },
      });

      await inngest.send({
        name: "source/extract-text",
        data: {
          sourceId: source.id,
          objectKey: input.objectKey,
          workspaceId: ctx.workspaceId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.create",
        entityType: "Source",
        entityId: source.id,
        metadata: { type: "file", objectKey: input.objectKey },
      });

      return { sourceId: source.id };
    }),

  replaceSource: workspaceProcedure
    .input(
      z.object({
        sourceId: z.string(),
        sessionId: z.string(),
        objectKey: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await db.uploadSession.findFirst({
        where: {
          id: input.sessionId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
      });

      if (!session) throw new Error("Upload session not found");
      if (session.consumedAt) throw new Error("Session already consumed");
      if (session.expiresAt < new Date()) throw new Error("Upload session expired");
      if (session.objectKey !== input.objectKey) throw new Error("Object key mismatch");

      const source = await db.source.findFirst({
        where: {
          id: input.sourceId,
          workspaceId: ctx.workspaceId,
          projectId: input.projectId,
          deletedAt: null,
        },
      });

      if (!source) throw new Error("Source not found");
      if (!source.content || source.content.length < 10) {
        throw new Error("Source has no content to replace. Use add source instead.");
      }

      const head = await headObject(input.objectKey);
      if (head.contentLength > Number(session.expectedSize)) {
        throw new Error("Uploaded file exceeds expected size");
      }

      await db.uploadSession.update({
        where: { id: input.sessionId },
        data: { consumedAt: new Date() },
      });

      await inngest.send({
        name: "source/replace-extract-text",
        data: {
          sourceId: input.sourceId,
          objectKey: input.objectKey,
          workspaceId: ctx.workspaceId,
          projectId: input.projectId,
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.replace",
        entityType: "Source",
        entityId: input.sourceId,
        metadata: { objectKey: input.objectKey },
      });

      return { sourceId: input.sourceId };
    }),
});
