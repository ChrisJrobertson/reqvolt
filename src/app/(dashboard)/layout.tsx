import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");

  return <>{children}</>;
}
