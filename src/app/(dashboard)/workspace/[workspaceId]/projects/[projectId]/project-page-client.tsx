"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { SourceReadinessPanel } from "@/components/pack/SourceReadinessPanel";
import { GenerationProgress } from "@/components/pack/GenerationProgress";

function MondayPushHistory({ projectId }: { projectId: string }) {
  const { data: history } = trpc.monday.getPushHistory.useQuery({ projectId });
  if (!history || history.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-4">Monday.com Push History</h2>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Pack</th>
              <th className="text-left p-3">Version</th>
              <th className="text-right p-3">Success</th>
              <th className="text-right p-3">Failed</th>
              <th className="text-right p-3">Skipped</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} className="border-t">
                <td className="p-3 text-muted-foreground">
                  {new Date(h.pushedAt).toLocaleString()}
                </td>
                <td className="p-3">{h.pushedBy}</td>
                <td className="p-3">{h.packName}</td>
                <td className="p-3">v{h.versionNumber}</td>
                <td className="p-3 text-right text-green-600">{h.success}</td>
                <td className="p-3 text-right text-red-600">{h.failed}</td>
                <td className="p-3 text-right text-muted-foreground">{h.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
import { AddSourceModal } from "./add-source-modal";
import { PackHealthBadge } from "@/components/pack-editor/pack-health-badge";
import { AttentionWidget } from "@/components/attention-widget";
import { EmailForwardingCard } from "@/components/project/EmailForwardingCard";

interface Source {
  id: string;
  type: string;
  name: string;
  content: string;
  extractionQuality: string | null;
  status: string;
  createdAt: Date;
}

interface Pack {
  id: string;
  name: string;
  healthScore?: number | null;
  healthStatus?: string | null;
}

interface Project {
  id: string;
  name: string;
  forwardingEmail?: string | null;
  sources: Source[];
  packs: Pack[];
}

export function ProjectPageClient({
  workspaceId,
  projectId,
  project: initialProject,
}: {
  workspaceId: string;
  projectId: string;
  project: Project;
}) {
  const [showAddSource, setShowAddSource] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [generateNotes, setGenerateNotes] = useState("");
  const selectedSourceIdList = Array.from(selectedSourceIds);

  const query = trpc.project.getById.useQuery(
    { projectId },
    {
      refetchInterval: (q) =>
        q.state.data?.sources?.some(
          (s) => s.status === "pending" || s.status === "processing"
        )
          ? 3000
          : false,
    }
  );
  const project = query.data ?? initialProject;
  const utils = trpc.useUtils();
  const deleteSource = trpc.source.delete.useMutation({
    onSuccess: () => {
      utils.project.getById.invalidate({ projectId });
      setSourceToDelete(null);
    },
  });
  const generatePack = trpc.pack.generate.useMutation({
    onSuccess: (data) => {
      utils.project.getById.invalidate({ projectId });
      window.location.href = `/workspace/${workspaceId}/projects/${projectId}/packs/${data.packId}`;
    },
  });
  const readiness = trpc.pack.assessReadiness.useQuery(
    { projectId, sourceIds: selectedSourceIdList },
    {
      enabled: selectedSourceIdList.length > 0,
      staleTime: 60_000,
    }
  );
  const { data: aiControls } = trpc.workspace.getAIProcessingControls.useQuery();

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    if (selectedSourceIds.size === 0) return;
    generatePack.mutate({
      projectId,
      sourceIds: selectedSourceIdList,
      userNotes: generateNotes || undefined,
    });
  };

  const completedSources = project?.sources.filter(
    (s) => s.status === "completed" && s.content?.length > 0
  ) ?? [];

  const recentEmailCount =
    project?.sources.filter((s) => s.type === "EMAIL").length ?? 0;

  const readinessStatus = readiness.data?.overallStatus;
  const generationDisabledByControls = aiControls?.aiGenerationEnabled === false;
  const generationBlocked = readinessStatus === "blocked" || generationDisabledByControls;
  const generationButtonLabel = generationDisabledByControls
    ? "AI generation disabled for this workspace"
    : readinessStatus === "blocked"
      ? "Cannot generate — resolve issues above"
      : readinessStatus === "warnings"
        ? "Generate Pack (with warnings)"
        : "Generate Story Pack";

  return (
    <div className="space-y-8">
      <section>
        <AttentionWidget workspaceId={workspaceId} projectId={projectId} />
      </section>
      {project?.forwardingEmail && (
        <section>
          <EmailForwardingCard
            forwardingEmail={project.forwardingEmail}
            recentEmailCount={recentEmailCount}
          />
        </section>
      )}
      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Sources</h2>
          <button
            onClick={() => setShowAddSource(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Add Source
          </button>
        </div>

        <ul className="space-y-2">
          {project?.sources.map((source) => (
            <li
              key={source.id}
              className={`p-4 border rounded-lg flex justify-between items-start gap-4 ${
                selectedSourceIds.has(source.id) ? "ring-2 ring-primary" : ""
              }`}
            >
              <div
                className="min-w-0 flex-1 cursor-pointer"
                onClick={() => {
                  if (source.status === "completed" && source.content)
                    toggleSource(source.id);
                }}
              >
                {source.status === "completed" && source.content && (
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.has(source.id)}
                    onChange={() => toggleSource(source.id)}
                    className="mr-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span className="font-medium">{source.name}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {source.type}
                </span>
                {(source.status === "pending" || source.status === "processing") && (
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    {source.status}
                  </span>
                )}
                {source.extractionQuality && source.status === "completed" && (
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      source.extractionQuality === "good"
                        ? "bg-green-100 text-green-800"
                        : source.extractionQuality === "partial"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {source.extractionQuality}
                  </span>
                )}
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {source.content
                    ? `${source.content.slice(0, 150)}${source.content.length > 150 ? "..." : ""}`
                    : "Extracting text..."}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {sourceToDelete === source.id ? (
                  <>
                    <button
                      onClick={() => deleteSource.mutate({ sourceId: source.id })}
                      disabled={deleteSource.isPending}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setSourceToDelete(null)}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSourceToDelete(source.id)}
                    className="text-sm text-muted-foreground hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!project?.sources || project.sources.length === 0) && (
            <li className="text-muted-foreground p-4 border rounded-lg">
              No sources yet. Add text, email, or upload files.
            </li>
          )}
        </ul>
        {aiControls?.aiEmbeddingEnabled === false && (
          <p className="mt-3 text-xs text-amber-700">
            Semantic search is unavailable because embedding generation is disabled for this
            workspace.
          </p>
        )}
      </section>

      <section>
        <MondayPushHistory projectId={projectId} />
      </section>

      <section>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Story Packs</h2>
          {completedSources.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <input
                type="text"
                placeholder="Guidance notes (optional)"
                value={generateNotes}
                onChange={(e) => setGenerateNotes(e.target.value)}
                className="px-3 py-1.5 border rounded-lg text-sm w-48"
              />
              <button
                onClick={handleGenerate}
                disabled={
                  generatePack.isPending || selectedSourceIds.size === 0 || generationBlocked
                }
                className={`px-4 py-2 rounded-lg disabled:opacity-50 ${
                  readinessStatus === "warnings"
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {generatePack.isPending ? "Generating..." : generationButtonLabel}
              </button>
              <p className="w-full text-right text-xs text-muted-foreground">
                🔒 Source material is processed via Anthropic&apos;s Claude API with zero
                data retention.{" "}
                <Link
                  href={`/workspace/${workspaceId}/settings/data-processing`}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  View AI processing policy
                </Link>
              </p>
            </div>
          )}
        </div>
        {selectedSourceIds.size > 0 && (
          <div className="mb-4">
            <SourceReadinessPanel
              report={readiness.data}
              isLoading={readiness.isLoading}
            />
          </div>
        )}

        <GenerationProgress
          active={generatePack.isPending}
          estimatedTimeLabel={readiness.data?.estimatedGenerationTime}
        />

        <ul className="space-y-2">
          {project?.packs.map((pack) => (
            <li key={pack.id}>
              <Link
                href={`/workspace/${workspaceId}/projects/${projectId}/packs/${pack.id}`}
                className="block p-4 border rounded-lg hover:bg-accent/50 flex items-center justify-between gap-3"
              >
                <span>{pack.name}</span>
                {pack.healthScore != null && pack.healthStatus && (
                  <PackHealthBadge
                    score={pack.healthScore}
                    status={
                      pack.healthStatus as
                        | "healthy"
                        | "stale"
                        | "at_risk"
                        | "outdated"
                    }
                  />
                )}
              </Link>
            </li>
          ))}
          {(!project?.packs || project.packs.length === 0) && (
            <li className="text-muted-foreground p-4 border rounded-lg">
              No packs yet. Add sources and generate a Story Pack.
            </li>
          )}
        </ul>
      </section>

      {showAddSource && (
        <AddSourceModal
          workspaceId={workspaceId}
          projectId={projectId}
          onClose={() => setShowAddSource(false)}
          onSuccess={() => {
            utils.project.getById.invalidate({ projectId });
            setShowAddSource(false);
          }}
        />
      )}
    </div>
  );
}
