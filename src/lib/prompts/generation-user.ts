export interface SourceChunkPrompt {
  id: string;
  content: string;
  chunkIndex: number;
  metadata?: { speaker?: string | null; timestamp?: string | null } | null;
}

export interface SourceWithChunksPrompt {
  id: string;
  name: string;
  type: string;
  chunks: SourceChunkPrompt[];
}

export function buildGenerationUserPrompt(
  sources: SourceWithChunksPrompt[],
  projectContext?: string
): string {
  const sections = sources
    .map((source) => {
      const chunks = source.chunks
        .sort((a, b) => a.chunkIndex - b.chunkIndex)
        .map((chunk) => {
          if (source.type.toLowerCase() === "transcript") {
            const speaker = chunk.metadata?.speaker ?? "Unknown speaker";
            const timestamp = chunk.metadata?.timestamp ?? "Unknown time";
            return `[chunk:${chunk.id}] (Speaker: ${speaker}, ${timestamp})\n${chunk.content}`;
          }
          return `[chunk:${chunk.id}]\n${chunk.content}`;
        })
        .join("\n\n");
      return `--- Source: ${source.name} (type: ${source.type}) ---\n\n${chunks}`;
    })
    .join("\n\n");

  return `Generate a Feature Story Pack from the following source material.

PROJECT CONTEXT:
${projectContext || "No additional project context provided."}

SOURCE MATERIAL:
Each chunk is labelled with its ID. Use these IDs in source_references.

${sections}

---

Remember:
- Cite chunk IDs in source_references for every AC
- If you cannot cite a source, mark as assumption and explain what's missing
- Surface ambiguities as Open Questions — do not resolve them by guessing
- UK English throughout`;
}
