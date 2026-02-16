import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";

export const notificationRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().optional().default(false),
        limit: z.number().min(1).max(100).optional().default(20),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        ...(input.unreadOnly && { isRead: false }),
      };

      const [notifications, unreadCount, total] = await Promise.all([
        db.notification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        db.notification.count({
          where: { userId: ctx.userId, workspaceId: ctx.workspaceId, isRead: false },
        }),
        db.notification.count({ where }),
      ]);

      return {
        notifications,
        unreadCount,
        total,
      };
    }),

  markRead: workspaceProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const notification = await db.notification.findFirst({
        where: {
          id: input.notificationId,
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
        },
      });
      if (!notification) throw new Error("Notification not found");

      await db.notification.update({
        where: { id: input.notificationId },
        data: { isRead: true, readAt: new Date() },
      });

      return { marked: true };
    }),

  markAllRead: workspaceProcedure.mutation(async ({ ctx }) => {
    const result = await db.notification.updateMany({
      where: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    return { markedRead: result.count };
  }),

  getUnreadCount: workspaceProcedure.query(async ({ ctx }) => {
    const count = await db.notification.count({
      where: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        isRead: false,
      },
    });

    return { count };
  }),
});
