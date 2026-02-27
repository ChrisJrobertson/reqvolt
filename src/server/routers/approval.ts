import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { requireProjectRole } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { sendEmail } from "../services/email";
import { ApprovalScope, ApprovalRequestStatus } from "@prisma/client";

export const approvalRouter = router({
  list: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      return db.approvalRequest.findMany({
        where: { packId: input.packId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  create: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        packVersionId: z.string(),
        approverName: z.string().min(1),
        approverEmail: z.string().email(),
        approvalScope: z.nativeEnum(ApprovalScope).default("full_pack"),
        scopeFilter: z.record(z.string(), z.unknown()).optional(),
        dueDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: { project: true },
      });
      if (!pack) throw new Error("Pack not found");
      await requireProjectRole(ctx.workspaceId, ctx.userId, pack.projectId, [
        "Approver",
        "admin",
      ]);

      const req = await db.approvalRequest.create({
        data: {
          workspaceId: ctx.workspaceId,
          packId: input.packId,
          packVersionId: input.packVersionId,
          approverName: input.approverName,
          approverEmail: input.approverEmail,
          approvalScope: input.approvalScope,
          scopeFilter: input.scopeFilter ? (input.scopeFilter as object) : undefined,
          dueDate: input.dueDate ?? undefined,
        },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://reqvolt.com";
      const approveUrl = `${baseUrl}/approve/${req.token}`;

      await sendEmail({
        to: input.approverEmail,
        subject: `Approval requested: ${pack.name}`,
        html: `<p>${input.approverName}, you have been asked to approve the pack "${pack.name}" for ${pack.project.name}.</p><p><a href="${approveUrl}">Review and approve here</a></p>`,
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "approval_request.created",
        entityType: "ApprovalRequest",
        entityId: req.id,
        metadata: { packId: input.packId },
      });

      return { ...req, approveUrl };
    }),

  revoke: workspaceProcedure
    .input(z.object({ approvalRequestId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const req = await db.approvalRequest.findFirst({
        where: {
          id: input.approvalRequestId,
          workspaceId: ctx.workspaceId,
          status: ApprovalRequestStatus.pending,
        },
        include: { pack: true },
      });
      if (!req) throw new Error("Approval request not found or not pending");
      await requireProjectRole(ctx.workspaceId, ctx.userId, req.pack.projectId, [
        "Approver",
        "admin",
      ]);

      await db.approvalRequest.delete({
        where: { id: input.approvalRequestId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "approval_request.revoked",
        entityType: "ApprovalRequest",
        entityId: input.approvalRequestId,
      });

      return { ok: true };
    }),
});
