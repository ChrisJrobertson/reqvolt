import { db } from "../db";

export const projectService = {
  async listByWorkspace(workspaceId: string) {
    return db.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
    });
  },

  async getById(projectId: string, workspaceId: string) {
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId },
      include: {
        sources: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
        packs: true,
      },
    });
    if (!project) throw new Error("Project not found");
    return project;
  },

  async create(
    workspaceId: string,
    data: { name: string; clientName?: string }
  ) {
    return db.project.create({
      data: {
        workspaceId,
        name: data.name,
        clientName: data.clientName,
      },
    });
  },
};
