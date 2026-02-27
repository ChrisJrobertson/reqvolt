/**
 * 5-layer pack generation prompt.
 * L1: System | L2: Template | L3: Glossary | L4: Source evidence | L5: User notes
 * L0: Methodology (terminology, artefact types)
 */
import type { MethodologyConfigJson } from "../methodology/types";

export function buildGenerationPrompt(params: {
  sourceChunks: Array<{ content: string; sourceId: string }>;
  templateContext?: string;
  glossaryContext?: string;
  userNotes?: string;
  methodology?: MethodologyConfigJson;
}): string {
  const layers: string[] = [];

  const packLabel = params.methodology?.terminology?.pack ?? "Story Pack";
  const enabledArtefacts = params.methodology?.artefactTypes?.filter((a) => a.enabled) ?? [];
  const hasStories = enabledArtefacts.some((a) => a.key === "story");
  const hasProductDesc = enabledArtefacts.some((a) => a.key === "product_description");
  const hasStakeholderMap = enabledArtefacts.some((a) => a.key === "stakeholder_map");
  const hasInfluenceAction = enabledArtefacts.some((a) => a.key === "influence_action");

  let artefactInstruction = "user stories with acceptance criteria";
  if (hasProductDesc && !hasStories) {
    artefactInstruction = "Product Descriptions (format: stakeholder/capability/benefit instead of persona/want/soThat)";
  } else if (hasStakeholderMap || hasInfluenceAction) {
    artefactInstruction = "user stories, and where relevant: Stakeholder Maps (name, role, influence level, engagement strategy) and Influence Actions (action, target stakeholder, Cialdini principle, outcome)";
  }

  layers.push(`You are an expert agile delivery professional. Convert discovery inputs into a structured ${packLabel}.
Output valid JSON only. Use UK English. Every story and acceptance criterion MUST link to evidence from the sources.
Format acceptance criteria as Given/When/Then.
Generate ${artefactInstruction}.`);

  if (params.methodology?.terminology) {
    layers.push(
      `\n## Methodology Terminology\nUse these terms: pack="${params.methodology.terminology.pack}", baseline="${params.methodology.terminology.baseline}", sprint="${params.methodology.terminology.sprint}"`
    );
  }

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

  layers.push(`\nGenerate a ${packLabel} as JSON with this structure:
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
