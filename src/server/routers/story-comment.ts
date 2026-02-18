import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";
import { createStoryCommentNotifications } from "../services/story-comment-notifications";

export const storyCommentRouter = router({
  list: workspaceProcedure
    .input(z.object({ storyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: {
          id: input.storyId,
          packVersion: { pack: { workspaceId: ctx.workspaceId } },
        },
        include: {
          packVersion: { select: { id: true } },
        },
      });
      if (!story) return [];

      const comments = await db.storyComment.findMany({
        where: { storyId: input.storyId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "asc" },
        include: {
          replies: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      const topLevel = comments.filter((c) => !c.parentId);
      const byId = new Map(comments.map((c) => [c.id, c]));

      return topLevel.map((c) => ({
        ...c,
        replies: (c.replies ?? []).map((r) => byId.get(r.id) ?? r),
      }));
    }),

  create: workspaceProcedure
    .input(
      z.object({
        storyId: z.string(),
        content: z.string().min(1).max(5000),
        parentId: z.string().optional(),
        mentions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const story = await db.story.findFirst({
        where: {
          id: input.storyId,
          packVersion: { pack: { workspaceId: ctx.workspaceId } },
        },
        include: {
          packVersion: {
            select: { id: true },
            include: { pack: { select: { id: true, projectId: true } } },
          },
        },
      });
      if (!story) throw new Error("Story not found");

      const comment = await db.storyComment.create({
        data: {
          storyId: input.storyId,
          packVersionId: story.packVersion.id,
          workspaceId: ctx.workspaceId,
          parentId: input.parentId ?? null,
          content: input.content.trim(),
          mentions: input.mentions ?? [],
          createdBy: ctx.userId,
        },
      });

      await createStoryCommentNotifications({
        comment,
        authorId: ctx.userId,
        packId: story.packVersion.pack.id,
        projectId: story.packVersion.pack.projectId,
        storyId: input.storyId,
        workspaceId: ctx.workspaceId,
        isReply: !!input.parentId,
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "storyComment.create",
        entityType: "StoryComment",
        entityId: comment.id,
        metadata: { storyId: input.storyId, parentId: input.parentId },
      });

      return comment;
    }),

  resolve: workspaceProcedure
    .input(z.object({ commentId: z.string(), resolved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.storyComment.findFirst({
        where: {
          id: input.commentId,
          workspaceId: ctx.workspaceId,
        },
      });
      if (!comment) throw new Error("Comment not found");

      await db.storyComment.update({
        where: { id: input.commentId },
        data: input.resolved
          ? { resolvedAt: new Date(), resolvedBy: ctx.userId }
          : { resolvedAt: null, resolvedBy: null },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: input.resolved ? "storyComment.resolve" : "storyComment.unresolve",
        entityType: "StoryComment",
        entityId: comment.id,
      });

      return { success: true };
    }),

  delete: workspaceProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.storyComment.findFirst({
        where: {
          id: input.commentId,
          workspaceId: ctx.workspaceId,
        },
      });
      if (!comment) throw new Error("Comment not found");

      await db.storyComment.delete({
        where: { id: input.commentId },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "storyComment.delete",
        entityType: "StoryComment",
        entityId: comment.id,
      });

      return { success: true };
    }),

  listWorkspaceMembers: workspaceProcedure.query(async ({ ctx }) => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { userId: true, email: true },
    });
    return members.map((m) => ({
      id: m.userId,
      email: m.email,
      label: m.email.split("@")[0] ?? m.email,
    }));
  }),
});
