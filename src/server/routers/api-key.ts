import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { generateApiKey } from "@/lib/api-keys";

export const apiKeyRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return db.apiKey.findMany({
      where: { workspaceId: ctx.workspaceId, isRevoked: false },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const { raw, hash, prefix } = generateApiKey();
      const key = await db.apiKey.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          createdBy: ctx.userId,
        },
      });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "apiKey.create",
        entityType: "ApiKey",
        entityId: key.id,
        metadata: { name: input.name },
      });
      return { id: key.id, name: key.name, key: raw };
    }),

  revoke: adminProcedure
    .input(z.object({ apiKeyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await db.apiKey.findFirst({
        where: { id: input.apiKeyId, workspaceId: ctx.workspaceId },
      });
      if (!key) throw new Error("API key not found");
      if (key.isRevoked) return { revoked: true };

      await db.apiKey.update({
        where: { id: input.apiKeyId },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "apiKey.revoke",
        entityType: "ApiKey",
        entityId: key.id,
        metadata: { name: key.name },
      });
      return { revoked: true };
    }),
});
