/**
 * JSON export for Story Packs.
 * Full pack data structure with metadata.
 */
interface Story {
  id: string;
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array<{ id: string; given: string; when: string; then: string }>;
  evidenceLinks?: Array<{ sourceChunkId: string; confidence: string }>;
  qaFlags?: Array<{ ruleCode: string; severity: string; message: string }>;
}

interface PackVersionData {
  summary: string | null;
  nonGoals: string | null;
  openQuestions: string[];
  assumptions: string[];
  decisions: string[];
  risks: string[];
  stories: Story[];
}

interface ExportInput {
  packId: string;
  packVersionId: string;
  packName: string;
  projectName: string;
  clientName?: string | null;
  versionNumber: number;
  sourceIds: string[];
  sourceNames: string[];
  healthScore: number | null;
  healthStatus: string | null;
  data: PackVersionData;
}

export function buildJson(input: ExportInput): Buffer {
  const {
    packId,
    packVersionId,
    packName,
    projectName,
    clientName,
    versionNumber,
    sourceIds,
    sourceNames,
    healthScore,
    healthStatus,
    data,
  } = input;

  const payload = {
    _meta: {
      exportedAt: new Date().toISOString(),
      packVersion: versionNumber,
      packVersionId,
      sourceIds,
      reqvoltVersion: "1.0",
    },
    pack: {
      id: packId,
      name: packName,
      projectName,
      clientName: clientName ?? null,
      versionNumber,
      sourceNames,
      healthScore,
      healthStatus,
    },
    summary: data.summary,
    nonGoals: data.nonGoals,
    openQuestions: data.openQuestions,
    assumptions: data.assumptions,
    decisions: data.decisions,
    risks: data.risks,
    stories: data.stories.map((s) => ({
      id: s.id,
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria,
      evidenceLinks: s.evidenceLinks ?? [],
      qaFlags: s.qaFlags ?? [],
    })),
  };

  return Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
}
