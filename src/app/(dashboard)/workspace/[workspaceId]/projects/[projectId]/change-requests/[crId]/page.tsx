import { getAuthUserId } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/server/db";
import Link from "next/link";
import { ChangeRequestDetailClient } from "./change-request-detail-client";

export const dynamic = "force-dynamic";

export default async function ChangeRequestDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string; crId: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const { workspaceId, projectId, crId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (!member) redirect("/dashboard");

  const cr = await db.changeRequest.findFirst({
    where: { id: crId, workspaceId },
    include: {
      pack: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });

  if (!cr) notFound();

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}/projects/${projectId}/change-requests`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← Change Requests
        </Link>
        <h1 className="text-2xl font-bold">{cr.title}</h1>
        <p className="text-muted-foreground">
          Pack: {cr.pack.name} • Created{" "}
          {new Date(cr.createdAt).toLocaleDateString()}
        </p>
      </header>

      <ChangeRequestDetailClient
        workspaceId={workspaceId}
        projectId={projectId}
        crId={crId}
      />
    </div>
  );
}
