import { db } from "../db";
import { SourceType } from "@prisma/client";

export const sourceService = {
  async list(projectId: string, workspaceId: string) {
    return db.source.findMany({
      where: { projectId, workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(sourceId: string, workspaceId: string) {
    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });
    if (!source) throw new Error("Source not found");
    return source;
  },

  async createText(
    workspaceId: string,
    projectId: string,
    data: {
      type: SourceType;
      name: string;
      content: string;
    }
  ) {
    return db.source.create({
      data: {
        workspaceId,
        projectId,
        type: data.type,
        name: data.name,
        content: data.content,
        status: "completed",
      },
    });
  },

  async createEmail(
    workspaceId: string,
    projectId: string,
    data: { subject: string; body: string }
  ) {
    return db.source.create({
      data: {
        workspaceId,
        projectId,
        type: SourceType.EMAIL,
        name: data.subject,
        content: data.body,
        metadata: { subject: data.subject, body: data.body },
        status: "completed",
      },
    });
  },

  async softDelete(sourceId: string, workspaceId: string) {
    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
    });
    if (!source) throw new Error("Source not found");
    await db.source.update({
      where: { id: sourceId },
      data: { deletedAt: new Date() },
    });
  },
};
