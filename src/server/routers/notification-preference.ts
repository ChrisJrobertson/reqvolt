import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";
import { auditService } from "../services/audit";

const EMAIL_FREQUENCY_VALUES = ["immediate", "daily", "weekly", "off"] as const;

export const notificationPreferenceRouter = router({
  get: workspaceProcedure.query(async ({ ctx }) => {
    const pref = await db.notificationPreference.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        },
      },
    });

    if (!pref) {
      return {
        emailFrequency: "daily" as const,
        notifySourceChanges: true,
        notifyDeliveryFeedback: true,
        notifyHealthDegraded: true,
        notifyEmailIngested: true,
        notifyMentions: true,
        notifyReplies: true,
      };
    }

    return {
      emailFrequency: pref.emailFrequency as (typeof EMAIL_FREQUENCY_VALUES)[number],
      notifySourceChanges: pref.notifySourceChanges,
      notifyDeliveryFeedback: pref.notifyDeliveryFeedback,
      notifyHealthDegraded: pref.notifyHealthDegraded,
      notifyEmailIngested: pref.notifyEmailIngested,
      notifyMentions: pref.notifyMentions,
      notifyReplies: pref.notifyReplies,
    };
  }),

  update: workspaceProcedure
    .input(
      z.object({
        emailFrequency: z.enum(EMAIL_FREQUENCY_VALUES).optional(),
        notifySourceChanges: z.boolean().optional(),
        notifyDeliveryFeedback: z.boolean().optional(),
        notifyHealthDegraded: z.boolean().optional(),
        notifyEmailIngested: z.boolean().optional(),
        notifyMentions: z.boolean().optional(),
        notifyReplies: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pref = await db.notificationPreference.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          emailFrequency: input.emailFrequency ?? "daily",
          notifySourceChanges: input.notifySourceChanges ?? true,
          notifyDeliveryFeedback: input.notifyDeliveryFeedback ?? true,
          notifyHealthDegraded: input.notifyHealthDegraded ?? true,
          notifyEmailIngested: input.notifyEmailIngested ?? true,
          notifyMentions: input.notifyMentions ?? true,
          notifyReplies: input.notifyReplies ?? true,
        },
        update: {
          ...(input.emailFrequency !== undefined && { emailFrequency: input.emailFrequency }),
          ...(input.notifySourceChanges !== undefined && { notifySourceChanges: input.notifySourceChanges }),
          ...(input.notifyDeliveryFeedback !== undefined && { notifyDeliveryFeedback: input.notifyDeliveryFeedback }),
          ...(input.notifyHealthDegraded !== undefined && { notifyHealthDegraded: input.notifyHealthDegraded }),
          ...(input.notifyEmailIngested !== undefined && { notifyEmailIngested: input.notifyEmailIngested }),
          ...(input.notifyMentions !== undefined && { notifyMentions: input.notifyMentions }),
          ...(input.notifyReplies !== undefined && { notifyReplies: input.notifyReplies }),
        },
      });

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "notificationPreference.update",
        entityType: "NotificationPreference",
        entityId: pref.id,
      });

      return pref;
    }),
});
