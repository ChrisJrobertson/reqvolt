import Link from "next/link";
import { NotificationPreferencesForm } from "./notification-preferences-form";

export default async function NotificationPreferencesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <div className="p-8">
      <header className="mb-8">
        <Link
          href={`/workspace/${workspaceId}/settings`}
          className="text-muted-foreground hover:underline mb-2 inline-block"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-bold">Notification Preferences</h1>
      </header>

      <NotificationPreferencesForm />
    </div>
  );
}
