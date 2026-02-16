import { inngest } from "../client";
import { db } from "@/server/db";
import { getObjectStream } from "@/lib/storage";
import { ExtractionQuality, SourceStatus } from "@prisma/client";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { createHash } from "node:crypto";

export const replaceExtractSourceText = inngest.createFunction(
  {
    id: "replace-extract-source-text",
    retries: 2,
  },
  { event: "source/replace-extract-text" },
  async ({ event, step }) => {
    const { sourceId, objectKey, workspaceId, projectId } = event.data;

    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });

    if (!source) throw new Error("Source not found");
    if (!source.content || source.content.length < 10) {
      return { sourceId, status: "skipped", reason: "no_content_to_replace" };
    }

    await db.source.update({
      where: { id: sourceId },
      data: { status: "processing" },
    });

    try {
      const stream = await getObjectStream(objectKey);
      if (!stream) throw new Error("Failed to get object from R2");

      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      let extractedText = "";
      const contentType = source.type === "PDF" ? "pdf" : "docx";

      if (contentType === "pdf") {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        extractedText = result.text ?? "";
        await parser.destroy();
      } else {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value ?? "";
      }

      const trimmed = extractedText.trim();
      let extractionQuality: ExtractionQuality = ExtractionQuality.failed;
      if (trimmed.length > 100) {
        extractionQuality = ExtractionQuality.good;
      } else if (trimmed.length >= 10) {
        extractionQuality = ExtractionQuality.partial;
      }

      if (trimmed.length < 10) {
        await db.source.update({
          where: { id: sourceId },
          data: {
            status: SourceStatus.failed,
            extractionQuality: ExtractionQuality.failed,
          },
        });
        return { sourceId, status: "failed", reason: "insufficient_content" };
      }

      const previousVersion = await db.sourceVersion.findFirst({
        where: { sourceId },
        orderBy: { versionNumber: "desc" },
      });
      const prevVersionNumber = previousVersion?.versionNumber ?? 0;

      const oldContentHash = createHash("sha256")
        .update(source.content)
        .digest("hex");
      const newContentHash = createHash("sha256").update(trimmed).digest("hex");

      const { previousVersionId, newVersionId } = await db.$transaction(
        async (tx) => {
          const prevVersion = await tx.sourceVersion.create({
            data: {
              sourceId,
              versionNumber: prevVersionNumber + 1,
              content: source.content,
              contentHash: oldContentHash,
              metadata: (source.metadata as object) ?? {},
            },
          });

          const newVersion = await tx.sourceVersion.create({
            data: {
              sourceId,
              versionNumber: prevVersionNumber + 2,
              content: trimmed,
              contentHash: newContentHash,
              metadata: {
                ...((source.metadata as object) ?? {}),
                objectKey,
                extractionQuality,
              },
            },
          });

          await tx.source.update({
            where: { id: sourceId },
            data: {
              content: trimmed,
              status: "completed",
              extractionQuality,
              currentVersionId: newVersion.id,
              metadata: {
                ...((source.metadata as object) ?? {}),
                objectKey,
                extractionQuality,
              },
            },
          });

          return {
            previousVersionId: prevVersion.id,
            newVersionId: newVersion.id,
          };
        }
      );

      await step.sendEvent("trigger-chunk-embed", {
        name: "source/chunk-and-embed",
        data: {
          sourceId,
          workspaceId,
          projectId,
          replace: true,
          newVersionId,
          previousVersionId,
        },
      });

      return {
        sourceId,
        status: "completed",
        previousVersionId,
        newVersionId,
      };
    } catch (err) {
      await db.source.update({
        where: { id: sourceId },
        data: {
          status: SourceStatus.failed,
          extractionQuality: ExtractionQuality.failed,
          metadata: {
            ...((source.metadata as object) ?? {}),
            objectKey,
            error: err instanceof Error ? err.message : "Extraction failed",
          },
        },
      });
      throw err;
    }
  }
);
