import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { inngest } from "../inngest/client";

export const deliveryFeedbackRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        resolved: z.boolean().optional().default(false),
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");

      const [feedback, total] = await Promise.all([
        db.deliveryFeedback.findMany({
          where: {
            packId: input.packId,
            isResolved: input.resolved === true,
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
          include: {
            storyExport: {
              select: {
                externalUrl: true,
                externalSystem: true,
                externalStatus: true,
              },
            },
            story: {
              select: { id: true, want: true },
            },
          },
        }),
        db.deliveryFeedback.count({
          where: {
            packId: input.packId,
            isResolved: input.resolved === true,
          },
        }),
      ]);

      return {
        feedback: feedback.map((f) => ({
          id: f.id,
          storyId: f.storyId,
          storyTitle: f.story.want,
          feedbackType: f.feedbackType,
          externalAuthor: f.externalAuthor,
          content: f.content,
          matchedSignalWords: f.matchedSignalWords,
          externalSystem: f.storyExport?.externalSystem ?? "unknown",
          externalUrl: f.storyExport?.externalUrl ?? null,
          externalStatus: f.storyExport?.externalStatus ?? null,
          createdAt: f.createdAt,
        })),
        total,
      };
    }),

  listByStory: workspaceProcedure
    .input(z.object({ storyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId },
        include: {
          packVersion: { include: { pack: true } },
        },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }

      const feedback = await db.deliveryFeedback.findMany({
        where: { storyId: input.storyId },
        orderBy: { createdAt: "desc" },
        include: {
          storyExport: {
            select: {
              externalUrl: true,
              externalSystem: true,
              externalId: true,
              externalStatus: true,
              externalStatusCategory: true,
              lastSyncedAt: true,
            },
          },
        },
      });

      return feedback;
    }),

  resolve: workspaceProcedure
    .input(
      z.object({
        feedbackId: z.string(),
        resolutionNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const feedback = await db.deliveryFeedback.findFirst({
        where: { id: input.feedbackId },
        include: { pack: true },
      });
      if (!feedback || feedback.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Feedback not found");
      }

      await db.deliveryFeedback.update({
        where: { id: input.feedbackId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: ctx.userId,
          resolutionNote: input.resolutionNote ?? null,
        },
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: feedback.packId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "deliveryFeedback.resolve",
        entityType: "DeliveryFeedback",
        entityId: input.feedbackId,
        metadata: { packId: feedback.packId },
      });

      return { resolved: true };
    }),
});
