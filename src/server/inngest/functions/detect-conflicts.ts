import { inngest } from "../client";
import { db } from "@/server/db";
import { detectConflicts } from "@/server/services/conflict-detection";
import { createNotificationsForWorkspace } from "@/server/services/notifications";

export const detectConflictsJob = inngest.createFunction(
  {
    id: "detect-source-conflicts",
    retries: 2,
  },
  [
    { event: "source/chunks.embedded" },
    { event: "project/detect-conflicts" },
  ],
  async ({ event, step }) => {
    const data = event.data as {
      sourceId?: string;
      projectId: string;
      workspaceId?: string;
    };

    const projectId = data.projectId;
    if (!projectId) return { status: "skipped", reason: "no_project_id" };

    const project = await db.project.findFirst({
      where: { id: projectId },
      include: { workspace: true },
    });
    if (!project) return { status: "skipped", reason: "project_not_found" };

    const workspaceId = project.workspaceId;

    const created = await step.run("detect-conflicts", () =>
      detectConflicts(projectId, workspaceId)
    );

    if (created.length > 0) {
      await step.run("notify-conflicts", async () => {
        await createNotificationsForWorkspace({
          workspaceId,
          type: "source_changed",
          title: `${created.length} evidence conflict(s) detected`,
          body: `Review conflicting evidence in project ${project.name}`,
          link: `/workspace/${workspaceId}/projects/${projectId}/evidence?tab=conflicts`,
          relatedSourceId: data.sourceId ?? undefined,
          preferenceKey: "notifySourceChanges",
        });
        return created.length;
      });
    }

    return {
      projectId,
      conflictsFound: created.length,
      status: "completed",
    };
  }
);
