/**
 * tRPC server setup with Clerk auth and workspace validation.
 * workspaceId comes from x-workspace-id header, NEVER from procedure input.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import * as Sentry from "@sentry/nextjs";
import { assertEnvValid } from "@/lib/env";
import { getAuthUserId } from "@/lib/auth";
import { db } from "./db";
import { WorkspaceRole, ProjectRole } from "@prisma/client";

export type ProjectRoleOrAdmin = ProjectRole | "admin";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  assertEnvValid();
  const userId = await getAuthUserId();
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

/** Resolve project role for a user. Workspace Admin = full access (admin). */
export async function getProjectRole(
  workspaceId: string,
  userId: string,
  projectId: string
): Promise<ProjectRoleOrAdmin> {
  const wsMember = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (wsMember?.role === WorkspaceRole.Admin) return "admin";

  const pm = await db.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
  });
  return pm?.role ?? "Viewer";
}

/** Throw FORBIDDEN if user's project role is not in allowed list. */
export async function requireProjectRole(
  workspaceId: string,
  userId: string,
  projectId: string,
  allowedRoles: ProjectRoleOrAdmin[]
): Promise<void> {
  const role = await getProjectRole(workspaceId, userId, projectId);
  if (!allowedRoles.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions for this project",
    });
  }
}

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
