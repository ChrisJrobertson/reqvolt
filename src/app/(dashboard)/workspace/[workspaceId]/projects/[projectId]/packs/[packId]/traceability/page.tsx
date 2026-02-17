import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { TraceabilityPageClient } from "@/components/pack/traceability/TraceabilityPageClient";

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
    select: { id: true },
  });
  if (!member) redirect("/dashboard");

  const pack = await db.pack.findFirst({
    where: {
      id: packId,
      workspaceId,
      projectId,
    },
    select: {
      id: true,
      name: true,
    },
  });
  if (!pack) {
    redirect(`/workspace/${workspaceId}/projects/${projectId}`);
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <TraceabilityPageClient
        workspaceId={workspaceId}
        projectId={projectId}
        packId={pack.id}
        packName={pack.name}
      />
    </div>
  );
}
