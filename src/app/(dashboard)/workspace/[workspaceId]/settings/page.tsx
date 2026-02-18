import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { MondaySettings } from "./monday-settings";
import { ApiKeyManagement } from "@/components/workspace/ApiKeyManagement";
import { JiraConnectionCard } from "@/components/workspace/JiraConnectionCard";

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

      <div className="space-y-8">
        <section>
          <Link
            href={`/workspace/${workspaceId}/settings/notifications`}
            className="block p-4 border rounded-lg hover:bg-muted/50"
          >
            <h2 className="font-semibold">Notifications</h2>
            <p className="text-sm text-muted-foreground">
              Email digest frequency and notification preferences
            </p>
          </Link>
        </section>

        <section>
          <Link
            href={`/workspace/${workspaceId}/settings/data-processing`}
            className="block p-4 border rounded-lg hover:bg-muted/50"
          >
            <h2 className="font-semibold">Data & AI Processing</h2>
            <p className="text-sm text-muted-foreground">
              Data flow, AI processing guarantees, sub-processors, and controls
            </p>
          </Link>
        </section>

        <MondaySettings workspaceId={workspaceId} />
        <section>
          <ApiKeyManagement />
        </section>
        <section>
          <JiraConnectionCard workspaceId={workspaceId} />
        </section>
      </div>
    </div>
  );
}
