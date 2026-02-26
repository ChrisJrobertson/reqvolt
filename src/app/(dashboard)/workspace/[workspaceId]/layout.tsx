import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { getAuthUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const { workspaceId } = await params;

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
    include: { workspace: true },
  });

  if (!member) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <WorkspaceHeader
        workspaceId={workspaceId}
        workspaceName={member.workspace.name}
      />
      <main>{children}</main>
    </div>
  );
}
