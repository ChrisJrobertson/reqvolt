"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  FileEdit,
  FileSearch,
  MessageSquare,
  AlertTriangle,
  Mail,
  AlertCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  source_changed: FileEdit,
  source_relevant: FileSearch,
  delivery_feedback: MessageSquare,
  health_degraded: AlertTriangle,
  email_ingested: Mail,
  sync_error: AlertCircle,
};

interface NotificationBellProps {
  workspaceId: string;
}

export function NotificationBell({ workspaceId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: unreadData } = trpc.notification.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const unreadCount = unreadData?.count ?? 0;

  const { data: listData } = trpc.notification.list.useQuery(
    { limit: 10 },
    { enabled: open }
  );
  const notifications = listData?.notifications ?? [];

  const markRead = trpc.notification.markRead.useMutation();
  const markAllRead = trpc.notification.markAllRead.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleNotificationClick = async (n: {
    id: string;
    isRead: boolean;
    link: string | null;
  }) => {
    if (!n.isRead) {
      await markRead.mutateAsync({ notificationId: n.id });
      utils.notification.getUnreadCount.invalidate();
      utils.notification.list.invalidate();
    }
    setOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
    utils.notification.getUnreadCount.invalidate();
    utils.notification.list.invalidate();
  };

  const IconComponent = Bell;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-muted"
        aria-label="Notifications"
      >
        <IconComponent className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-96 max-h-[28rem] bg-background border rounded-lg shadow-lg z-50 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <IconComponent className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => {
                  const TypeIcon = TYPE_ICONS[n.type] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left p-3 flex gap-3 hover:bg-muted/50 transition-colors ${
                          !n.isRead
                            ? "bg-primary/5 border-l-4 border-l-primary"
                            : ""
                        }`}
                      >
                        <TypeIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          {n.body && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {n.body}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(n.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-2 border-t">
            <Link
              href={`/workspace/${workspaceId}/settings/notifications`}
              onClick={() => setOpen(false)}
              className="block text-center text-xs text-muted-foreground hover:underline py-1"
            >
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
