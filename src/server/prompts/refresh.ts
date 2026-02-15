/**
 * 6-layer refresh prompt for iterative pack updates.
 * L1: System + refresh rules | L2: Previous pack | L3: Source delta (NEW) | L4: Instructions | L5: Chunks (NEW tagged) | L6: User notes
 */

export function buildRefreshPrompt(params: {
  previousPackJson: string;
  newSourceIds: string[];
  allChunks: Array<{ content: string; sourceId: string; isNew: boolean }>;
  userNotes?: string;
}): string {
  const layers: string[] = [];

  layers.push(`You are an expert agile delivery professional. You are REFRESHING an existing Story Pack with new discovery inputs.
Output valid JSON only. Use UK English. Preserve structure. Every story and AC must link to evidence.
When new sources add evidence: mark evolutionStatus. When evidence is contradicted: mark contradicted.`);

  layers.push(`\n## Previous Pack (JSON)\n${params.previousPackJson}`);

  layers.push(
    `\n## Source Delta\nNew sources (not in previous pack): ${params.newSourceIds.length} source(s). These are marked [NEW] in the chunks below.`
  );

  layers.push(`\n## Refresh Instructions\nIntegrate new evidence. Update stories/ACs if new sources contradict or strengthen. Add new stories if warranted. Resolve assumptions if new evidence supports it.`);

  layers.push(
    `\n## All Source Chunks\n${params.allChunks
      .map(
        (c, i) =>
          `[Chunk ${i}]${c.isNew ? " [NEW]" : ""}\n${c.content}`
      )
      .join("\n\n")}`
  );

  if (params.userNotes) {
    layers.push(`\n## User Notes\n${params.userNotes}`);
  }

  layers.push(`\nOutput JSON with the SAME structure as the previous pack, plus a "changeAnalysis" object:
{
  "summary": "string",
  "nonGoals": "string",
  "stories": [...],
  "openQuestions": ["string"],
  "assumptions": ["string"],
  "decisions": ["string"],
  "risks": ["string"],
  "changeAnalysis": {
    "storiesAdded": ["persona summary"],
    "storiesModified": ["persona - what changed"],
    "assumptionsResolved": ["string"],
    "newAssumptions": ["string"],
    "newOpenQuestions": ["string"],
    "evidenceEvolution": ["entity - evolution note"]
  }
}
For each EvidenceLink, set evolutionStatus: "new" | "strengthened" | "contradicted" | "unchanged" | "removed".`);

  return layers.join("\n");
}
