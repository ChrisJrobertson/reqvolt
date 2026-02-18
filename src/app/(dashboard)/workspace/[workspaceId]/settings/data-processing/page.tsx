import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { DataProcessingContent } from "./data-processing-content";

export const dynamic = "force-dynamic";

export default async function DataProcessingPage({
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

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← {member.workspace.name} Settings
        </Link>
        <h1 className="text-2xl font-bold">Data & AI Processing</h1>
        <p className="text-muted-foreground text-sm">
          How Reqvolt handles your workspace data and AI processing
        </p>
      </header>

      <DataProcessingContent workspaceId={workspaceId} isAdmin={member.role === "Admin"} />
    </div>
  );
}
