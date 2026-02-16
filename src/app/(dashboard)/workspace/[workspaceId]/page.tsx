import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { WorkspaceDashboard } from "./workspace-dashboard";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { workspaceId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });

  if (!member) redirect("/dashboard");

  const projects = await db.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{member.workspace.name}</h1>
        <p className="text-muted-foreground">Workspace</p>
      </div>

      <WorkspaceDashboard
        workspaceId={workspaceId}
        projects={projects}
      />
    </div>
  );
}
