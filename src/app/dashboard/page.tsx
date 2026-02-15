import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { WorkspaceRole } from "@prisma/client";

export default async function DashboardPage() {
  const { userId } = await auth();
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
