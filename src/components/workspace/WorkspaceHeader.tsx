"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { GlobalSearch } from "@/components/search/GlobalSearch";

interface WorkspaceHeaderProps {
  workspaceId: string;
  workspaceName: string;
}

export function WorkspaceHeader({ workspaceId, workspaceName }: WorkspaceHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-6">
          <Link
            href={`/workspace/${workspaceId}`}
            className="font-semibold hover:underline"
          >
            {workspaceName}
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
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
      <GlobalSearch
        workspaceId={workspaceId}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </>
  );
}
