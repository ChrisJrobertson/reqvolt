import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import Link from "next/link";
import { ProjectPageClient } from "./project-page-client";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { workspaceId, projectId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });

  if (!member) redirect("/dashboard");

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

  if (!project) redirect(`/workspace/${workspaceId}`);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← {member.workspace.name}
        </Link>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.clientName && (
          <p className="text-muted-foreground">{project.clientName}</p>
        )}
      </header>

      <ProjectPageClient
        workspaceId={workspaceId}
        projectId={projectId}
        project={project}
      />
    </div>
  );
}
