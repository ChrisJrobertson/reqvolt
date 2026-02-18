"use client";

interface ChunkMetadata {
  speaker?: string | null;
  timestamp?: string | null;
  timestampSeconds?: number | null;
}

interface TranscriptEvidenceDisplayProps {
  chunk: { content: string; metadata?: ChunkMetadata | null };
  source: { id: string; name: string; type: string };
  confidence: string;
  evolutionStatus?: string;
}

export function TranscriptEvidenceDisplay({
  chunk,
  source,
  confidence,
  evolutionStatus,
}: TranscriptEvidenceDisplayProps) {
  const meta = chunk.metadata as ChunkMetadata | undefined;
  const speaker = meta?.speaker ?? null;
  const timestamp = meta?.timestamp ?? null;

  return (
    <div className="p-3 rounded-lg border bg-background text-sm">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {source.name}
      </div>
      {speaker && (
        <div className="font-semibold text-foreground">
          {speaker}
          {timestamp && (
            <span className="font-normal text-muted-foreground ml-1">
              ({timestamp})
            </span>
          )}
        </div>
      )}
      <p className="mt-1 italic text-muted-foreground line-clamp-4">
        &ldquo;{chunk.content}&rdquo;
      </p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {evolutionStatus && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              evolutionStatus === "new"
                ? "bg-blue-100 dark:bg-blue-950/50"
                : evolutionStatus === "strengthened"
                  ? "bg-green-100 dark:bg-green-950/50"
                  : evolutionStatus === "contradicted"
                    ? "bg-red-100 dark:bg-red-950/50"
                    : "bg-gray-100 dark:bg-muted"
            }`}
          >
            {evolutionStatus}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Confidence: {confidence}
        </span>
      </div>
    </div>
  );
}
