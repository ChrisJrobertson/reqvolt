"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { AttentionWidget } from "@/components/attention-widget";

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

  const createProject = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setProjectName("");
    },
  });

  return (
    <div className="space-y-8">
      <section>
        <AttentionWidget workspaceId={workspaceId} />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-4">Create Project</h2>
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
            className="px-4 py-2 border rounded-lg w-64"
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

      <section>
        <h2 className="text-lg font-semibold mb-4">Projects</h2>
        <ul className="space-y-2">
          {projects?.map((project) => (
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
          {(!projects || projects.length === 0) && (
            <li className="text-muted-foreground p-4">
              No projects yet. Create one above.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
