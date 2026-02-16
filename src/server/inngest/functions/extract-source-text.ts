import { inngest } from "../client";
import { db } from "@/server/db";
import { getObjectStream } from "@/lib/storage";
import { ExtractionQuality, SourceStatus } from "@prisma/client";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const extractSourceText = inngest.createFunction(
  {
    id: "extract-source-text",
    retries: 2,
  },
  { event: "source/extract-text" },
  async ({ event, step }) => {
    const { sourceId, objectKey, workspaceId } = event.data;

    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });

    if (!source) {
      throw new Error("Source not found");
    }

    if (source.status === "completed") {
      return { sourceId, status: "already_extracted" };
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

      await db.source.update({
        where: { id: sourceId },
        data: {
          content: trimmed,
          status: trimmed.length >= 10 ? "completed" : "failed",
          extractionQuality,
          metadata: {
            ...((source.metadata as object) ?? {}),
            objectKey,
            extractionQuality,
          },
        },
      });

      if (trimmed.length >= 10) {
        await step.sendEvent("trigger-chunk-embed", {
          name: "source/chunk-and-embed",
          data: {
            sourceId,
            workspaceId,
            projectId: source.projectId,
          },
        });
      }

      return {
        sourceId,
        status: trimmed.length >= 10 ? "completed" : "failed",
        extractionQuality,
        charCount: trimmed.length,
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
