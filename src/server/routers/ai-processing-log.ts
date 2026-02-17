import { z } from "zod";
import { router, workspaceProcedure, adminProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { createPresignedDownloadUrl, putObject } from "@/lib/storage";

const listInputSchema = z.object({
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  taskType: z.string().optional(),
  model: z.string().optional(),
  limit: z.number().min(1).max(200).default(50),
  offset: z.number().min(0).default(0),
});

export const aiProcessingLogRouter = router({
  list: workspaceProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateFrom = input.dateFrom ? new Date(input.dateFrom) : defaultFrom;
    const dateTo = input.dateTo ? new Date(input.dateTo) : now;

    const rows = await db.auditLog.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        action: "ai_processing",
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      orderBy: { createdAt: "desc" },
      take: input.limit + input.offset + 200,
    });

    const filtered = rows.filter((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (input.taskType && row.entityType !== input.taskType) return false;
      if (input.model && metadata.model !== input.model) return false;
      return true;
    });

    const paged = filtered.slice(input.offset, input.offset + input.limit);
    return {
      total: filtered.length,
      rows: paged.map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          date: row.createdAt,
          taskType: row.entityType,
          model: String(metadata.model ?? ""),
          provider: String(metadata.provider ?? "anthropic"),
          sourceIds: Array.isArray(metadata.sourceIds)
            ? (metadata.sourceIds as string[])
            : [],
          tokensSent: Number(metadata.inputTokens ?? 0),
          tokensReceived: Number(metadata.outputTokens ?? 0),
          durationMs: Number(metadata.requestDurationMs ?? 0),
          dataRetention: String(metadata.dataRetentionByProvider ?? "none"),
        };
      }),
    };
  }),

  exportCsv: adminProcedure
    .input(
      z.object({
        dateFrom: z.string().datetime().optional(),
        dateTo: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const dateFrom = input.dateFrom ? new Date(input.dateFrom) : defaultFrom;
      const dateTo = input.dateTo ? new Date(input.dateTo) : now;

      const rows = await db.auditLog.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          action: "ai_processing",
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const header =
        "date,taskType,model,provider,sourceIds,inputTokens,outputTokens,durationMs,dataRetention\n";
      const csvRows = rows
        .map((row) => {
          const metadata = (row.metadata ?? {}) as Record<string, unknown>;
          const sourceIds = Array.isArray(metadata.sourceIds)
            ? (metadata.sourceIds as string[]).join("|")
            : "";
          return [
            row.createdAt.toISOString(),
            row.entityType,
            String(metadata.model ?? ""),
            String(metadata.provider ?? "anthropic"),
            sourceIds,
            Number(metadata.inputTokens ?? 0),
            Number(metadata.outputTokens ?? 0),
            Number(metadata.requestDurationMs ?? 0),
            String(metadata.dataRetentionByProvider ?? "none"),
          ]
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(",");
        })
        .join("\n");

      const objectKey = `exports/ai-processing/${ctx.workspaceId}/${Date.now()}.csv`;
      await putObject(objectKey, Buffer.from(header + csvRows, "utf-8"), "text/csv");
      const url = await createPresignedDownloadUrl({ objectKey, expiresIn: 300 });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "ai_processing_log_exported",
        entityType: "Workspace",
        entityId: ctx.workspaceId,
        metadata: {
          objectKey,
          dateFrom: dateFrom.toISOString(),
          dateTo: dateTo.toISOString(),
          count: rows.length,
        },
      });

      return { url };
    }),
});
