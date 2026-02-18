/**
 * User prompt template for pack generation.
 * Provides source material with chunk IDs for citation.
 */
export interface SourceChunkForPrompt {
  id: string;
  content: string;
  sourceId: string;
  sourceName?: string;
  sourceType?: string;
  metadata?: { speaker?: string; timestamp?: string };
}

export function buildGenerationUserPrompt(params: {
  sources: Array<{
    id: string;
    name: string;
    type: string;
    chunks: SourceChunkForPrompt[];
  }>;
  projectContext?: string;
  userNotes?: string;
}): string {
  const parts: string[] = [];

  parts.push("Generate a Feature Story Pack from the following source material.");
  parts.push("");
  parts.push("PROJECT CONTEXT:");
  parts.push(params.projectContext || "No additional project context provided.");
  parts.push("");
  parts.push("SOURCE MATERIAL:");
  parts.push("Each chunk is labelled with its ID. Use these IDs in source_references.");
  parts.push("");

  for (const source of params.sources) {
    parts.push(`--- Source: ${source.name} (type: ${source.type}) ---`);
    parts.push("");

    for (const chunk of source.chunks) {
      if (source.type === "TRANSCRIPT" || source.type === "INTERVIEW_TRANSCRIPT") {
        const meta = chunk.metadata as { speaker?: string; timestamp?: string } | undefined;
        const speaker = meta?.speaker ? ` (Speaker: ${meta.speaker}` : "";
        const ts = meta?.timestamp ? `${speaker ? ", " : " ("}${meta.timestamp}` : "";
        parts.push(`[chunk:${chunk.id}]${speaker || ts ? `${speaker}${ts})` : ""}`);
      } else {
        parts.push(`[chunk:${chunk.id}]`);
      }
      parts.push(chunk.content);
      parts.push("");
    }
  }

  parts.push("---");
  parts.push("");
  parts.push("Remember:");
  parts.push("- Cite chunk IDs in source_references for every AC");
  parts.push("- If you cannot cite a source, mark as assumption and explain what's missing");
  parts.push("- Surface ambiguities as Open Questions — do not resolve them by guessing");
  parts.push("- UK English throughout");

  if (params.userNotes) {
    parts.push("");
    parts.push("USER NOTES:");
    parts.push(params.userNotes);
  }

  return parts.join("\n");
}
