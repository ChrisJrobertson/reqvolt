/**
 * tRPC server setup with Clerk auth and workspace validation.
 * workspaceId comes from x-workspace-id header, NEVER from procedure input.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@clerk/nextjs/server";
import { db } from "./db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId } = await auth();
  const workspaceId = opts.headers.get("x-workspace-id");

  if (!userId) {
    return { userId: null, workspaceId: null, db };
  }

  if (!workspaceId) {
    return { userId, workspaceId: null, db };
  }

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (!member) {
    return { userId, workspaceId: null, db };
  }

  return { userId, workspaceId, db };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
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
    },
  });
});
