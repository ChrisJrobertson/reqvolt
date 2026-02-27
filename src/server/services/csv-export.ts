/**
 * CSV export for Story Packs.
 * Lightweight CSV builder using template literals.
 */
interface Story {
  id: string;
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  evidenceSources?: string[];
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
  packName: string;
  projectName: string;
  clientName?: string | null;
  versionNumber: number;
  sourceNames: string[];
  generationDate: string;
  data: PackVersionData;
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatAC(ac: { given: string; when: string; then: string }): string {
  return `${ac.given} | ${ac.when} | ${ac.then}`;
}

export function buildCsv(input: ExportInput): Buffer {
  const lines: string[] = [];
  const { packName, projectName, clientName, sourceNames, generationDate, data } =
    input;

  // Metadata header rows
  lines.push(escapeCsvCell("Pack"), escapeCsvCell(packName));
  lines.push(escapeCsvCell("Project"), escapeCsvCell(projectName));
  if (clientName) {
    lines.push(escapeCsvCell("Client"), escapeCsvCell(clientName));
  }
  lines.push(escapeCsvCell("Generation Date"), escapeCsvCell(generationDate));
  lines.push(escapeCsvCell("Sources"), escapeCsvCell(sourceNames.join("; ")));
  lines.push("");

  // Column headers
  const headers = [
    "artefact_type",
    "id",
    "title",
    "description",
    "acceptance_criteria",
    "priority",
    "status",
    "evidence_sources",
  ];
  lines.push(headers.map(escapeCsvCell).join(","));

  // Stories
  for (const s of data.stories) {
    const title = s.persona;
    const description = `${s.want} ${s.soThat}`.trim();
    const acs = s.acceptanceCriteria.map(formatAC).join(" | ");
    const evidenceSources = (s.evidenceSources ?? []).join("; ");
    lines.push(
      [
        "story",
        s.id,
        title,
        description,
        acs,
        "", // priority
        "", // status
        evidenceSources,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  const csv = lines.join("\r\n");
  const bom = "\uFEFF";
  return Buffer.from(bom + csv, "utf-8");
}
