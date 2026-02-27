import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { PortfolioDashboardClient } from "./portfolio-dashboard-client";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
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

  const projects = await db.project.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true },
  });

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← Workspace
        </Link>
        <h1 className="text-2xl font-bold">Portfolio Analytics</h1>
        <p className="text-muted-foreground">
          Cross-project metrics, risk signals, and cycle time
        </p>
      </header>

      <PortfolioDashboardClient
        workspaceId={workspaceId}
        projects={projects}
      />
    </div>
  );
}
