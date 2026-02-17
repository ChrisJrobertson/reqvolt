"use client";

import { useState } from "react";
import { PackHeader } from "./pack-header";
import { PackEditor } from "./pack-editor";
import { PackHealthPanel } from "./pack-health-panel";
import { SourceChangeImpactBanner } from "./SourceChangeImpactBanner";
import { TraceabilityMini } from "@/components/pack/TraceabilityMini";
import { GenerationConfidenceBar } from "@/components/pack/GenerationConfidenceBar";
import type { QualityReport } from "@/lib/quality/types";
import { PackFeedbackPrompt } from "@/components/pack/PackFeedbackPrompt";

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
  const latestConfidence =
    selectedVersionIndex === 0
      ? ((latestVersion?.generationConfidence as QualityReport | undefined) ?? null)
      : null;

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
      <div className="mb-6">
        <PackHealthPanel packId={pack.id} />
      </div>
      {selectedVersionIndex === 0 && (
        <div className="mb-6">
          <GenerationConfidenceBar
            report={latestConfidence}
            score={latestVersion?.confidenceScore ?? null}
            level={latestVersion?.confidenceLevel ?? null}
          />
        </div>
      )}
      <div className="mb-6">
        <TraceabilityMini
          workspaceId={workspaceId}
          projectId={projectId}
          packId={pack.id}
        />
      </div>
      <PackEditor
        pack={displayPack}
        evidenceMapByVersionId={evidenceMapByVersionId}
        selectedVersionIndex={selectedVersionIndex}
      />
      {selectedVersionIndex === 0 && <PackFeedbackPrompt packId={pack.id} />}
    </>
  );
}
