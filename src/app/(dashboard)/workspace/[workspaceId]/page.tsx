import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import Link from "next/link";
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
    <div className="min-h-screen p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{member.workspace.name}</h1>
          <p className="text-muted-foreground">Workspace</p>
        </div>
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Settings
        </Link>
      </header>

      <WorkspaceDashboard
        workspaceId={workspaceId}
        projects={projects}
      />
    </div>
  );
}
