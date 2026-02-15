import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { projectService } from "../services/project";
import { auditService } from "../services/audit";

export const projectRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return projectService.listByWorkspace(ctx.workspaceId);
  }),

  getById: workspaceProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return projectService.getById(input.projectId, ctx.workspaceId);
    }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        clientName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await projectService.create(ctx.workspaceId, input);
      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "project.create",
        entityType: "Project",
        entityId: project.id,
      });
      return project;
    }),
});
