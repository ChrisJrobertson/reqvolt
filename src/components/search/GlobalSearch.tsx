"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { trpc } from "@/lib/trpc";
import {
  Package,
  FileText,
  Database,
  FolderOpen,
  Search,
  Loader2,
} from "lucide-react";

const DEBOUNCE_MS = 300;

const TYPE_ICONS = {
  pack: Package,
  story: FileText,
  source: Database,
  project: FolderOpen,
} as const;

interface GlobalSearchProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = trpc.search.global.useQuery(
    { query: debouncedQuery, limit: 10 },
    { enabled: open && debouncedQuery.length >= 2 }
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const handleSelect = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(href);
    },
    [onOpenChange, router]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50">
      <Command
        className="w-full max-w-xl rounded-lg border bg-background shadow-lg overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search packs, stories, sources…"
            className="flex h-12 w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            autoFocus
          />
          {isLoading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          {query.length < 2 ? (
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Type to search…
            </Command.Empty>
          ) : !isLoading && results.length === 0 ? (
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found
            </Command.Empty>
          ) : (
            <>
              {results.map((r) => {
                const Icon = TYPE_ICONS[r.type] ?? Package;
                return (
                  <Command.Item
                    key={`${r.type}-${r.id}`}
                    value={`${r.type}-${r.id}-${r.title}`}
                    onSelect={() => handleSelect(r.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none aria-selected:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.title}</p>
                      {r.subtitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </p>
                      )}
                    </div>
                  </Command.Item>
                );
              })}
            </>
          )}
        </Command.List>
      </Command>
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 -z-10"
        onClick={() => onOpenChange(false)}
      />
    </div>
  );
}
