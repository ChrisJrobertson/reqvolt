import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { DataProcessingPageClient } from "@/components/workspace/DataProcessingPageClient";

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
    <div className="min-h-screen p-6 md:p-8">
      <header className="mb-6">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="mb-2 inline-block text-sm text-muted-foreground hover:underline"
        >
          ← Workspace Settings
        </Link>
        <h1 className="text-2xl font-bold">Data & AI Processing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Technical transparency for data flow, AI processing events, and provider
          responsibilities.
        </p>
      </header>
      <DataProcessingPageClient
        workspaceId={workspaceId}
        isAdmin={member.role === "Admin"}
      />
    </div>
  );
}
