/**
 * tRPC server setup with Clerk auth and workspace validation.
 * workspaceId comes from x-workspace-id header, NEVER from procedure input.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { db } from "./db";
import { WorkspaceRole } from "@prisma/client";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId } = await auth();
  const workspaceId = opts.headers.get("x-workspace-id");

  if (!userId) {
    return { userId: null, workspaceId: null, member: null, db };
  }

  if (!workspaceId) {
    return { userId, workspaceId: null, member: null, db };
  }

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (!member) {
    return { userId, workspaceId: null, member: null, db };
  }

  return { userId, workspaceId, member, db };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, path }) {
    const code = error.code;
    if (
      code !== "UNAUTHORIZED" &&
      code !== "FORBIDDEN" &&
      code !== "NOT_FOUND" &&
      code !== "BAD_REQUEST"
    ) {
      Sentry.withScope((scope) => {
        scope.setTag("trpc", "error");
        scope.setExtra("code", code);
        if (path) scope.setExtra("path", path);
        if (error.cause) scope.setExtra("cause", String(error.cause));
        Sentry.captureException(error);
      });
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const workspaceProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "x-workspace-id header required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      member: ctx.member!,
    },
  });
});

export const adminProcedure = workspaceProcedure.use(async ({ ctx, next }) => {
  if (ctx.member?.role !== WorkspaceRole.Admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required",
    });
  }
  return next({ ctx });
});

/** Platform-level admin: userId must be in ADMIN_USER_IDS env. Not workspace-scoped. */
export const platformAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const adminIds = process.env.ADMIN_USER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  if (adminIds.length === 0 || !adminIds.includes(ctx.userId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Platform admin access required",
    });
  }
  return next({ ctx });
});
