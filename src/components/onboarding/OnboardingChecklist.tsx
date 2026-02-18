"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  FolderPlus,
  Database,
  Package,
  UserPlus,
  Plug,
  Check,
  ChevronRight,
} from "lucide-react";

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  project: FolderPlus,
  source: Database,
  pack: Package,
  invite: UserPlus,
  integration: Plug,
};

interface OnboardingChecklistProps {
  workspaceId: string;
}

export function OnboardingChecklist({ workspaceId }: OnboardingChecklistProps) {
  const utils = trpc.useUtils();
  const { data: progress } = trpc.onboarding.getProgress.useQuery();
  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: () => utils.onboarding.getProgress.invalidate(),
  });
  const dismiss = trpc.onboarding.dismiss.useMutation({
    onSuccess: () => utils.onboarding.getProgress.invalidate(),
  });

  const { data: memberData } = trpc.workspace.getCurrentMember.useQuery();

  useEffect(() => {
    if (!progress?.justCompleted) return;
    const t = setTimeout(() => {
      complete.mutate();
    }, 3000);
    return () => clearTimeout(t);
  }, [progress?.justCompleted, complete]);

  if (!progress || progress.completed) return null;

  const completedCount = progress.steps.filter((s) => s.completed).length;
  const totalCount = progress.steps.length;
  const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (progress.justCompleted) {
    return (
      <div key={workspaceId} className="rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 p-6 text-center">
        <p className="text-lg font-semibold text-green-800 dark:text-green-200">
          You&apos;re all set!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Dismissing in a moment…
        </p>
      </div>
    );
  }

  return (
    <div key={workspaceId} className="rounded-lg border p-6 bg-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Get started with Reqvolt</h2>
        <span className="text-sm text-muted-foreground">
          {completedCount}/{totalCount} complete
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted mb-6 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="space-y-4">
        {progress.steps.map((step) => {
          const Icon = STEP_ICONS[step.id] ?? FolderPlus;
          return (
            <li key={step.id}>
              {step.completed ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground line-through">
                      {step.title}
                    </p>
                    <p className="text-sm">{step.description}</p>
                  </div>
                </div>
              ) : step.href ? (
                <Link
                  href={step.href}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {memberData?.role === "Admin" && (
        <div className="mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            {dismiss.isPending ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      )}
    </div>
  );
}
