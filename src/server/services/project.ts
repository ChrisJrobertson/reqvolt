import { db } from "../db";
import { env } from "@/lib/env";
import { randomBytes } from "crypto";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "project";
}

function generateForwardingEmail(projectName: string): string {
  const slug = slugify(projectName);
  const random = randomBytes(4).toString("hex");
  const domain = env.INBOUND_EMAIL_DOMAIN;
  return `${slug}-${random}@${domain}`;
}

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
    const forwardingEmail = generateForwardingEmail(data.name);
    return db.project.create({
      data: {
        workspaceId,
        name: data.name,
        clientName: data.clientName,
        forwardingEmail,
      },
    });
  },
};
