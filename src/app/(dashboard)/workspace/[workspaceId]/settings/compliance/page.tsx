import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { CompliancePageClient } from "./compliance-page-client";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
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
        <h1 className="text-2xl font-bold">Security & Compliance</h1>
        <p className="text-muted-foreground">
          Legal hold, retention policy, compliance export, and SSO
        </p>
      </header>

      <CompliancePageClient workspaceId={workspaceId} />
    </div>
  );
}
