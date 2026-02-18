"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { AttentionWidget } from "@/components/attention-widget";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { HealthOverviewChart } from "@/components/dashboard/HealthOverviewChart";
import { SourceTypePieChart } from "@/components/dashboard/SourceTypePieChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderOpen } from "lucide-react";

interface Project {
  id: string;
  name: string;
  clientName: string | null;
  updatedAt: Date;
}

export function WorkspaceDashboard({
  workspaceId,
  projects: initialProjects,
}: {
  workspaceId: string;
  projects: Project[];
}) {
  const [projectName, setProjectName] = useState("");
  const utils = trpc.useUtils();

  const query = trpc.project.list.useQuery(undefined);
  const projects = query.data ?? initialProjects;

  const { data: onboardingProgress } = trpc.onboarding.getProgress.useQuery();
  const { data: stats } = trpc.dashboard.getStats.useQuery();
  const { data: activity } = trpc.dashboard.getRecentActivity.useQuery();
  const { data: healthOverview } = trpc.dashboard.getHealthOverview.useQuery();
  const { data: sourceBreakdown } = trpc.dashboard.getSourceTypeBreakdown.useQuery();

  const createProject = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.dashboard.getStats.invalidate();
      utils.dashboard.getRecentActivity.invalidate();
      utils.dashboard.getSourceTypeBreakdown.invalidate();
      setProjectName("");
    },
  });

  return (
    <div className="space-y-8">
      {!onboardingProgress?.completed && (
        <section>
          <OnboardingChecklist workspaceId={workspaceId} />
        </section>
      )}
      {/* Row 1: Stat cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total packs"
          value={stats?.totalPacks ?? 0}
          trend={stats?.totalPacksTrend}
        />
        <StatCard
          title="Avg health score"
          value={stats?.avgHealthScore ?? "—"}
          trend={stats?.avgHealthTrend ?? undefined}
        />
        <StatCard
          title="Stories generated"
          value={stats?.storiesGenerated ?? 0}
          trend={stats?.storiesGeneratedTrend}
        />
        <StatCard
          title="Sources ingested"
          value={stats?.sourcesIngested ?? 0}
          trend={stats?.sourcesIngestedTrend}
        />
      </section>

      {/* Row 2: Attention + Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AttentionWidget workspaceId={workspaceId} />
        <RecentActivityFeed entries={activity ?? []} />
      </section>

      {/* Row 3: Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HealthOverviewChart packs={healthOverview ?? []} />
        <SourceTypePieChart data={sourceBreakdown ?? []} />
      </section>

      {/* Create project */}
      <section id="create-project">
        <h2 className="text-lg font-semibold mb-4">Create project</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (projectName.trim()) {
              createProject.mutate({ name: projectName.trim() });
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
            className="px-4 py-2 border border-input bg-background rounded-lg w-64"
          />
          <button
            type="submit"
            disabled={createProject.isPending || !projectName.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </section>

      {/* Projects list */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Projects</h2>
        {projects && projects.length > 0 ? (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/workspace/${workspaceId}/projects/${project.id}`}
                  className="block p-4 border rounded-lg hover:bg-accent/50"
                >
                  <span className="font-medium">{project.name}</span>
                  {project.clientName && (
                    <span className="text-muted-foreground ml-2">
                      — {project.clientName}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border rounded-lg">
            <EmptyState
              icon={FolderOpen}
              title="No projects yet"
              description="Create your first project to start managing requirements."
              action={{
                label: "Create project",
                href: "#create-project",
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
