import { router, workspaceProcedure, adminProcedure } from "../trpc";
import { db } from "../db";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  href?: string;
  icon: string;
}

export const onboardingRouter = router({
  getProgress: workspaceProcedure.query(async ({ ctx }) => {
    const workspaceId = ctx.workspaceId;

    const [workspace, projectCount, sourceCount, packCount, memberCount, apiKeyCount, jiraConnection, projectWithEmail] =
      await Promise.all([
        db.workspace.findUnique({
          where: { id: workspaceId },
          select: { onboardingCompleted: true },
        }),
        db.project.count({ where: { workspaceId } }),
        db.source.count({
          where: { workspaceId, deletedAt: null },
        }),
        db.pack.count({ where: { workspaceId } }),
        db.workspaceMember.count({ where: { workspaceId } }),
        db.apiKey.count({
          where: { workspaceId, isRevoked: false },
        }),
        db.jiraConnection.findFirst({
          where: { workspaceId, isActive: true },
        }),
        db.project.findFirst({
          where: { workspaceId, forwardingEmail: { not: null } },
        }),
      ]);

    const hasProject = projectCount >= 1;
    const hasSource = sourceCount >= 1;
    const hasPack = packCount >= 1;
    const hasTeamMember = memberCount >= 2;
    const hasIntegration =
      apiKeyCount >= 1 || !!jiraConnection || !!projectWithEmail;

    const firstProject = hasProject
      ? await db.project.findFirst({
          where: { workspaceId },
          select: { id: true },
        })
      : null;

    const steps: OnboardingStep[] = [
      {
        id: "project",
        title: "Create your first project",
        description: "Projects organise your requirements and sources.",
        completed: hasProject,
        href: `/workspace/${workspaceId}`,
        icon: "FolderPlus",
      },
      {
        id: "source",
        title: "Add a source document",
        description: "Upload a document, paste notes, or import from Jira.",
        completed: hasSource,
        href: firstProject
          ? `/workspace/${workspaceId}/projects/${firstProject.id}`
          : `/workspace/${workspaceId}`,
        icon: "Database",
      },
      {
        id: "pack",
        title: "Generate your first pack",
        description: "Turn sources into AI-generated story packs.",
        completed: hasPack,
        href: firstProject
          ? `/workspace/${workspaceId}/projects/${firstProject.id}`
          : `/workspace/${workspaceId}`,
        icon: "Package",
      },
      {
        id: "invite",
        title: "Invite a team member",
        description: "Collaborate with your team on requirements.",
        completed: hasTeamMember,
        href: `/workspace/${workspaceId}/settings`,
        icon: "UserPlus",
      },
      {
        id: "integration",
        title: "Set up an integration",
        description: "Connect Jira, Monday.com, or email forwarding.",
        completed: hasIntegration,
        href: `/workspace/${workspaceId}/settings`,
        icon: "Plug",
      },
    ];

    const allComplete = steps.every((s) => s.completed);
    const completed = allComplete || (workspace?.onboardingCompleted ?? false);

    return {
      completed,
      steps,
      justCompleted: allComplete && !workspace?.onboardingCompleted,
    };
  }),

  complete: workspaceProcedure.mutation(async ({ ctx }) => {
    await db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { onboardingCompleted: true },
    });
    return { success: true };
  }),

  dismiss: adminProcedure.mutation(async ({ ctx }) => {
    await db.workspace.update({
      where: { id: ctx.workspaceId },
      data: { onboardingCompleted: true },
    });
    return { success: true };
  }),
});
