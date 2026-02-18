import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";

export const aiProcessingLogRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        taskType: z.string().optional(),
        model: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.workspaceId !== ctx.workspaceId) throw new Error("Workspace not found");

      const where: {
        workspaceId: string;
        action: string;
        createdAt?: { gte?: Date; lte?: Date };
      } = {
        workspaceId: input.workspaceId,
        action: "ai_processing",
      };

      if (input.dateFrom || input.dateTo) {
        where.createdAt = {};
        if (input.dateFrom) where.createdAt.gte = input.dateFrom;
        if (input.dateTo) where.createdAt.lte = input.dateTo;
      }

      const logs = await db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 100,
        skip: input.offset,
      });

      const filtered = (input.taskType || input.model
        ? logs.filter((log) => {
            const meta = log.metadata as Record<string, unknown> | null;
            if (!meta) return false;
            if (input.taskType && meta.entityType !== input.taskType) return false;
            if (input.model && meta.model !== input.model) return false;
            return true;
          })
        : logs
      ).slice(0, input.limit);

      return filtered.map((log) => {
        const meta = log.metadata as Record<string, unknown> | null;
        return {
          id: log.id,
          date: log.createdAt,
          taskType: meta?.entityType ?? "—",
          model: meta?.model ?? "—",
          provider: meta?.provider ?? "—",
          sourceIds: (meta?.sourceIds as string[]) ?? [],
          tokensSent: meta?.inputTokens ?? 0,
          tokensReceived: meta?.outputTokens ?? 0,
          duration: meta?.requestDurationMs ?? 0,
          retention: "None",
        };
      });
    }),
});
