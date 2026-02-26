import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { WorkspaceRole } from "@prisma/client";
import { getAuthUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const members = await db.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
  });

  if (members.length === 0) {
    const workspace = await db.workspace.create({
      data: {
        name: "My Workspace",
        members: {
          create: {
            userId,
            role: WorkspaceRole.Admin,
            email: "",
          },
        },
      },
    });
    redirect(`/workspace/${workspace.id}`);
  }

  redirect(`/workspace/${members[0]!.workspace.id}`);
}
