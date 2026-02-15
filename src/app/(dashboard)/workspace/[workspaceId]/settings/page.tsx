import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { MondaySettings } from "./monday-settings";

export default async function WorkspaceSettingsPage({
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
          href={`/workspace/${workspaceId}`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← {member.workspace.name}
        </Link>
        <h1 className="text-2xl font-bold">Workspace Settings</h1>
      </header>

      <MondaySettings workspaceId={workspaceId} />
    </div>
  );
}
