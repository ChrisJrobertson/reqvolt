"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
  userName: string;
  link?: string | null;
}

interface RecentActivityFeedProps {
  entries: ActivityEntry[];
}

function formatAction(action: string): string {
  const actionMap: Record<string, string> = {
    "pack.create": "created pack",
    "pack.generate": "generated pack",
    "source.create": "added source",
    "source.delete": "deleted source",
    "project.create": "created project",
    "storyComment.create": "commented",
    "pack.refresh": "refreshed pack",
    "pack.runQa": "ran QA",
  };
  const verb = actionMap[action] ?? action.replace(".", " ");
  return `${verb}`;
}

export function RecentActivityFeed({ entries }: RecentActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border p-4 bg-card">
        <h3 className="font-semibold mb-3">Recent activity</h3>
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 bg-card">
      <h3 className="font-semibold mb-3">Recent activity</h3>
      <ul className="space-y-2">
        {entries.map((entry) => {
          const link = entry.link ?? null;
          const content = (
            <span className="text-sm">
              <span className="font-medium">{entry.userName}</span>{" "}
              {formatAction(entry.action)}
              {entry.entityType === "Pack" && " "}
              {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
            </span>
          );
          return (
            <li key={entry.id}>
              {link ? (
                <Link
                  href={link}
                  className="block p-2 rounded hover:bg-muted/50"
                >
                  {content}
                </Link>
              ) : (
                <div className="p-2 rounded">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
