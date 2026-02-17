import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { QualityDashboardClient } from "@/components/admin/QualityDashboardClient";

export const dynamic = "force-dynamic";

function isPlatformAdmin(userId: string): boolean {
  const adminIds = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

export default async function AdminQualityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isPlatformAdmin(userId)) redirect("/dashboard");

  return (
    <div className="min-h-screen p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Quality Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Platform-wide generation quality, feedback, edit analytics, and model cost tracking.
        </p>
      </header>
      <QualityDashboardClient />
    </div>
  );
}
