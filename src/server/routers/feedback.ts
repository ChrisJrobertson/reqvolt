import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";

export const feedbackRouter = router({
  clearStoryFeedback: workspaceProcedure
    .input(z.object({ storyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.storyFeedback.deleteMany({
        where: { storyId: input.storyId, userId: ctx.userId },
      });
      return { ok: true };
    }),

  rateStory: workspaceProcedure
    .input(z.object({ storyId: z.string(), rating: z.enum(["UP", "DOWN"]) }))
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId, deletedAt: null },
        include: { packVersion: { include: { pack: true } } },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }
      await db.storyFeedback.upsert({
        where: {
          storyId_userId: { storyId: input.storyId, userId: ctx.userId },
        },
        create: {
          storyId: input.storyId,
          packId: story.packVersion.packId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          rating: input.rating,
        },
        update: { rating: input.rating },
      });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "story.feedback",
        entityType: "Story",
        entityId: input.storyId,
        metadata: { rating: input.rating },
      });
      return { ok: true };
    }),

  ratePack: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        rating: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");
      await db.packFeedback.upsert({
        where: {
          packId_userId: { packId: input.packId, userId: ctx.userId },
        },
        create: {
          packId: input.packId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          rating: input.rating,
          comment: input.comment,
        },
        update: { rating: input.rating, comment: input.comment },
      });
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.feedback",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { rating: input.rating },
      });
      return { ok: true };
    }),

  getStoryFeedback: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");
      const feedback = await db.storyFeedback.findMany({
        where: { packId: input.packId },
      });
      const byStory = feedback.reduce(
        (acc, f) => {
          if (!acc[f.storyId]) acc[f.storyId] = [];
          acc[f.storyId]!.push(f);
          return acc;
        },
        {} as Record<string, typeof feedback>
      );
      return { feedback: byStory, currentUserRatings: feedback.filter((f) => f.userId === ctx.userId) };
    }),

  getPackFeedback: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
      });
      if (!pack) throw new Error("Pack not found");
      const all = await db.packFeedback.findMany({
        where: { packId: input.packId },
      });
      const summary = {
        positive: all.filter((f) => f.rating === "POSITIVE").length,
        neutral: all.filter((f) => f.rating === "NEUTRAL").length,
        negative: all.filter((f) => f.rating === "NEGATIVE").length,
      };
      const currentUser = all.find((f) => f.userId === ctx.userId);
      return { summary, currentUserRating: currentUser?.rating ?? null };
    }),
});
