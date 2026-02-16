import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { NotificationBell } from "@/components/NotificationBell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-6">
          <Link
            href={`/workspace/${workspaceId}`}
            className="font-semibold hover:underline"
          >
            {member.workspace.name}
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell workspaceId={workspaceId} />
            <Link
              href={`/workspace/${workspaceId}/settings`}
              className="text-sm text-muted-foreground hover:underline px-2"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
