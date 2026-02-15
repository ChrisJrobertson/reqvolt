"use client";

import { useState } from "react";
import { PackHeader } from "./pack-header";
import { PackEditor } from "./pack-editor";

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
  summary: string | null;
  nonGoals: string | null;
  openQuestions: unknown;
  assumptions: unknown;
  decisions: unknown;
  risks: unknown;
  changeAnalysis: ChangeAnalysis | null;
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

  return (
    <>
      <PackHeader
        pack={displayPack}
        sources={sources}
        selectedVersionIndex={selectedVersionIndex}
        onVersionChange={setSelectedVersionIndex}
        workspaceId={workspaceId}
        projectId={projectId}
      />
      <PackEditor
        pack={displayPack}
        evidenceMapByVersionId={evidenceMapByVersionId}
        selectedVersionIndex={selectedVersionIndex}
      />
    </>
  );
}
