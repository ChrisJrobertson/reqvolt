"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-muted/50 p-4 mb-4">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      {action &&
        (action.href ? (
          <Link
            href={action.href}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 font-medium"
          >
            {action.label}
          </Link>
        ) : action.onClick ? (
          <button
            type="button"
            onClick={action.onClick}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 font-medium"
          >
            {action.label}
          </button>
        ) : null)}
    </div>
  );
}
