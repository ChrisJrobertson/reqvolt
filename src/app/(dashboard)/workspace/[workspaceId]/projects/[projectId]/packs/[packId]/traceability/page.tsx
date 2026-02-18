import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import Link from "next/link";
import { TraceabilityGraph } from "@/components/pack/TraceabilityGraph";

export const dynamic = "force-dynamic";

export default async function TraceabilityPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; packId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { workspaceId, projectId, packId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });

  if (!member) redirect("/dashboard");

  const pack = await db.pack.findFirst({
    where: { id: packId, workspaceId },
    include: { project: true },
  });

  if (!pack) redirect(`/workspace/${workspaceId}/projects/${projectId}`);

  return (
    <div className="min-h-screen p-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/workspace/${workspaceId}`} className="hover:underline">
          {member.workspace.name}
        </Link>
        <span>/</span>
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}`}
          className="hover:underline"
        >
          {pack.project.name}
        </Link>
        <span>/</span>
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}/packs/${packId}`}
          className="hover:underline"
        >
          {pack.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Traceability Graph</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">Traceability Graph</h1>
        <p className="text-muted-foreground">
          Visual traceability from sources to stories, acceptance criteria, evidence, and chunks.
        </p>
      </header>

      <TraceabilityGraph
        packId={packId}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  );
}
