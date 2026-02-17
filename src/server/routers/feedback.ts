import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";

export const feedbackRouter = router({
  rateStory: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        rating: z.enum(["UP", "DOWN"]).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: { id: input.storyId, deletedAt: null },
        include: {
          packVersion: {
            include: { pack: true },
          },
        },
      });
      if (!story || story.packVersion.pack.workspaceId !== ctx.workspaceId) {
        throw new Error("Story not found");
      }

      if (input.rating === null) {
        await db.storyFeedback.deleteMany({
          where: { storyId: input.storyId, userId: ctx.userId },
        });
      } else {
        await db.storyFeedback.upsert({
          where: {
            storyId_userId: {
              storyId: input.storyId,
              userId: ctx.userId,
            },
          },
          update: {
            rating: input.rating,
          },
          create: {
            storyId: input.storyId,
            packId: story.packVersion.packId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            rating: input.rating,
          },
        });
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "feedback.story.rate",
        entityType: "Story",
        entityId: input.storyId,
        metadata: { rating: input.rating },
      });

      return { success: true };
    }),

  ratePack: workspaceProcedure
    .input(
      z.object({
        packId: z.string(),
        rating: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]).nullable(),
        comment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!pack) throw new Error("Pack not found");

      if (input.rating === null) {
        await db.packFeedback.deleteMany({
          where: { packId: input.packId, userId: ctx.userId },
        });
      } else {
        await db.packFeedback.upsert({
          where: {
            packId_userId: {
              packId: input.packId,
              userId: ctx.userId,
            },
          },
          update: {
            rating: input.rating,
            comment: input.comment,
          },
          create: {
            packId: input.packId,
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            rating: input.rating,
            comment: input.comment,
          },
        });
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "feedback.pack.rate",
        entityType: "Pack",
        entityId: input.packId,
        metadata: { rating: input.rating, hasComment: !!input.comment },
      });

      return { success: true };
    }),

  getStoryFeedback: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: {
                where: { deletedAt: null },
                select: { id: true },
              },
            },
          },
        },
      });
      if (!pack) throw new Error("Pack not found");

      const storyIds = pack.versions[0]?.stories.map((story) => story.id) ?? [];
      const feedbackRows = await db.storyFeedback.findMany({
        where: { packId: input.packId, storyId: { in: storyIds } },
        select: { storyId: true, rating: true, userId: true },
      });

      const grouped = storyIds.reduce(
        (acc, storyId) => {
          acc[storyId] = { up: 0, down: 0, currentUserRating: null };
          return acc;
        },
        {} as Record<string, { up: number; down: number; currentUserRating: "UP" | "DOWN" | null }>
      );

      for (const row of feedbackRows) {
        if (!grouped[row.storyId]) {
          grouped[row.storyId] = { up: 0, down: 0, currentUserRating: null };
        }
        if (row.rating === "UP") grouped[row.storyId]!.up += 1;
        if (row.rating === "DOWN") grouped[row.storyId]!.down += 1;
        if (row.userId === ctx.userId) {
          grouped[row.storyId]!.currentUserRating = row.rating;
        }
      }

      return grouped;
    }),

  getPackFeedback: workspaceProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pack = await db.pack.findFirst({
        where: { id: input.packId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!pack) throw new Error("Pack not found");

      const feedbackRows = await db.packFeedback.findMany({
        where: { packId: input.packId },
        select: { rating: true, userId: true },
      });
      const summary = { positive: 0, neutral: 0, negative: 0 };
      let currentUserRating: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null = null;
      for (const row of feedbackRows) {
        if (row.rating === "POSITIVE") summary.positive += 1;
        if (row.rating === "NEUTRAL") summary.neutral += 1;
        if (row.rating === "NEGATIVE") summary.negative += 1;
        if (row.userId === ctx.userId) currentUserRating = row.rating;
      }

      return { ...summary, currentUserRating };
    }),
});
