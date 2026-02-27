import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import Link from "next/link";
import { ChangeRequestsClient } from "./change-requests-client";

export const dynamic = "force-dynamic";

export default async function ChangeRequestsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const { workspaceId, projectId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (!member) redirect("/dashboard");

  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  if (!project) redirect(`/workspace/${workspaceId}`);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-bold">Change Requests</h1>
        <p className="text-muted-foreground">
          Track and approve changes triggered by source updates.
        </p>
      </header>

      <ChangeRequestsClient
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  );
}
