"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PackHeader } from "./pack-header";
import { PackEditor } from "./pack-editor";
import { PackHealthPanel } from "./pack-health-panel";
import { TraceabilityMini } from "@/components/pack/TraceabilityMini";
import { GenerationConfidenceBar } from "@/components/pack/GenerationConfidenceBar";
import { PackFeedbackPrompt } from "@/components/pack/PackFeedbackPrompt";
import { SourceChangeImpactBanner } from "./SourceChangeImpactBanner";
import { BaselinesPanel } from "./BaselinesPanel";

interface Source {
  id: string;
  name: string;
  type: string;
}

interface EvidenceLink {
  id: string;
  confidence: string;
  evolutionStatus: string;
  sourceChunk: { content: string };
}

interface EvidenceMap {
  story: Record<string, EvidenceLink[]>;
  acceptance_criteria: Record<string, EvidenceLink[]>;
}

interface ChangeAnalysis {
  storiesAdded?: string[];
  storiesModified?: string[];
  assumptionsResolved?: string[];
  newAssumptions?: string[];
  newOpenQuestions?: string[];
  evidenceEvolution?: string[];
}

interface QAFlag {
  id: string;
  entityType: string;
  entityId: string;
  ruleCode: string;
  severity: string;
  message: string;
  suggestedFix: string | null;
  resolvedBy: string | null;
}

interface PackVersion {
  id: string;
  versionNumber: number;
  sourceIds?: unknown;
  summary: string | null;
  nonGoals: string | null;
  openQuestions: unknown;
  assumptions: unknown;
  decisions: unknown;
  risks: unknown;
  changeAnalysis: ChangeAnalysis | null;
  generationConfidence?: unknown;
  confidenceScore?: number | null;
  confidenceLevel?: string | null;
  qaFlags?: QAFlag[];
  stories: Array<{
    id: string;
    sortOrder: number;
    persona: string;
    want: string;
    soThat: string;
    acceptanceCriteria: Array<{
      id: string;
      sortOrder: number;
      given: string;
      when: string;
      then: string;
    }>;
  }>;
}

interface Pack {
  id: string;
  name: string;
  project: { name: string };
  versions: PackVersion[];
}

export function PackPageClient({
  pack,
  evidenceMapByVersionId,
  sources,
  workspaceId,
  projectId,
}: {
  pack: Omit<Pack, "versions"> & { versions: Array<Omit<PackVersion, "changeAnalysis"> & { changeAnalysis?: unknown }> };
  evidenceMapByVersionId: Record<string, EvidenceMap>;
  sources: Source[];
  workspaceId: string;
  projectId: string;
}) {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);

  const displayPack: Pack = {
    ...pack,
    versions: pack.versions.map((v) => ({
      ...v,
      changeAnalysis: (v.changeAnalysis ?? null) as ChangeAnalysis | null,
    })),
  };

  const latestVersion = displayPack.versions[0];
  const sourceIds = (latestVersion?.sourceIds as string[] | undefined) ?? [];

  const { data: impactReport } = trpc.sourceImpact.getImpactReport.useQuery(
    { packId: pack.id },
    { enabled: !!pack.id }
  );
  const affectedStoryIds = new Set(
    impactReport?.stories?.map((s) => s.id) ?? []
  );

  return (
    <>
      <SourceChangeImpactBanner
        packId={pack.id}
        workspaceId={workspaceId}
        projectId={projectId}
        sourceIds={sourceIds}
      />
      <PackHeader
        pack={displayPack}
        sources={sources}
        selectedVersionIndex={selectedVersionIndex}
        onVersionChange={setSelectedVersionIndex}
        workspaceId={workspaceId}
        projectId={projectId}
      />
      {latestVersion && (
        <GenerationConfidenceBar
          report={(latestVersion.generationConfidence ?? null) as Parameters<typeof GenerationConfidenceBar>[0]["report"]}
          packVersionId={latestVersion.id}
          isLatestVersion={selectedVersionIndex === 0}
        />
      )}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <PackHealthPanel packId={pack.id} />
        </div>
        <TraceabilityMini
          packId={pack.id}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      </div>
      <div className="mb-6">
        <BaselinesPanel
          packId={pack.id}
          isApproved={(pack as { reviewStatus?: string }).reviewStatus === "approved"}
        />
      </div>
      <PackEditor
        pack={displayPack}
        evidenceMapByVersionId={evidenceMapByVersionId}
        selectedVersionIndex={selectedVersionIndex}
        workspaceId={workspaceId}
        projectId={projectId}
        affectedStoryIds={affectedStoryIds}
      />
      <PackFeedbackPrompt packId={pack.id} />
    </>
  );
}
