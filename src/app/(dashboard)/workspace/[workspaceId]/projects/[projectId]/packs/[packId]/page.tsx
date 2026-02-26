import { getAuthUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { PackPageClient } from "@/components/pack-editor/pack-page-client";
import { getEvidenceMapForPackVersion } from "@/server/services/pack";

export default async function PackPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; packId: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const { workspaceId, projectId, packId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });

  if (!member) redirect("/dashboard");

  const pack = await db.pack.findFirst({
    where: { id: packId, workspaceId },
    include: {
      project: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          stories: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              acceptanceCriteria: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          qaFlags: true,
        },
      },
    },
  });

  if (!pack) redirect(`/workspace/${workspaceId}/projects/${projectId}`);

  const sources = await db.source.findMany({
    where: { projectId: pack.projectId, deletedAt: null, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, type: true },
  });

  const evidenceMapByVersionId: Record<
    string,
    {
      story: Record<string, Array<{ id: string; confidence: string; evolutionStatus: string; sourceChunk: { content: string } }>>;
      acceptance_criteria: Record<string, Array<{ id: string; confidence: string; evolutionStatus: string; sourceChunk: { content: string } }>>;
    }
  > = {};
  for (const v of pack.versions) {
    evidenceMapByVersionId[v.id] = await getEvidenceMapForPackVersion(v.id);
  }

  return (
    <div className="min-h-screen p-8">
      {pack.versions[0] ? (
        <PackPageClient
          pack={pack}
          evidenceMapByVersionId={evidenceMapByVersionId}
          sources={sources}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      ) : (
        <p className="text-muted-foreground">
          No version yet. Generate a pack from the project page.
        </p>
      )}
    </div>
  );
}
