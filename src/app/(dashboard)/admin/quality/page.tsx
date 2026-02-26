import { getAuthUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminQualityDashboard } from "./admin-quality-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminQualityPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (adminIds.length === 0 || !adminIds.includes(userId)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Quality Dashboard</h1>
        <p className="text-muted-foreground text-sm">Internal — generation quality metrics</p>
      </header>
      <AdminQualityDashboard />
    </div>
  );
}
