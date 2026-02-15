/**
 * 5-layer pack generation prompt.
 * L1: System | L2: Template | L3: Glossary | L4: Source evidence | L5: User notes
 */

export function buildGenerationPrompt(params: {
  sourceChunks: Array<{ content: string; sourceId: string }>;
  templateContext?: string;
  glossaryContext?: string;
  userNotes?: string;
}): string {
  const layers: string[] = [];

  layers.push(`You are an expert agile delivery professional. Convert discovery inputs into a structured Story Pack.
Output valid JSON only. Use UK English. Every story and acceptance criterion MUST link to evidence from the sources.
Format acceptance criteria as Given/When/Then.`);

  if (params.templateContext) {
    layers.push(`\n## Template Context\n${params.templateContext}`);
  }

  if (params.glossaryContext) {
    layers.push(`\n## Glossary\n${params.glossaryContext}`);
  }

  layers.push(`\n## Source Evidence\n${params.sourceChunks.map((c, i) => `[Chunk ${i + 1}]\n${c.content}`).join("\n\n")}`);

  if (params.userNotes) {
    layers.push(`\n## User Notes\n${params.userNotes}`);
  }

  layers.push(`\nGenerate a Story Pack as JSON with this structure:
{
  "summary": "string",
  "nonGoals": "string",
  "stories": [
    {
      "persona": "string",
      "want": "string",
      "soThat": "string",
      "acceptanceCriteria": [
        { "given": "string", "when": "string", "then": "string", "evidenceChunkIndices": [0, 1] }
      ],
      "evidenceChunkIndices": [0]
    }
  ],
  "openQuestions": ["string"],
  "assumptions": ["string"],
  "decisions": ["string"],
  "risks": ["string"]
}
Reference evidence by chunk index (0-based). Every story and AC must have at least one evidence link.`);

  return layers.join("\n");
}
