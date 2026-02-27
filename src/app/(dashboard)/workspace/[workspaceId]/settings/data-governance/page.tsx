import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { DataGovernanceClient } from "./data-governance-client";

export const dynamic = "force-dynamic";

export default async function DataGovernancePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const { workspaceId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });

  if (!member) redirect("/dashboard");
  if (member.role !== "Admin") redirect(`/workspace/${workspaceId}`);

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-bold">Data Governance</h1>
        <p className="text-muted-foreground">
          Retention policies, SAR export, and deletion controls
        </p>
      </header>

      <DataGovernanceClient workspaceId={workspaceId} />
    </div>
  );
}
