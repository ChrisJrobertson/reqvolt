"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type AIControlState = {
  aiGenerationEnabled: boolean;
  aiQaAutoFixEnabled: boolean;
  aiSelfReviewEnabled: boolean;
  aiTopicExtractionEnabled: boolean;
  aiEmbeddingEnabled: boolean;
};

interface AIProcessingControlsProps {
  isAdmin: boolean;
}

function valueToLabel(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled";
}

function labelToValue(value: "Enabled" | "Disabled"): boolean {
  return value === "Enabled";
}

export function AIProcessingControls({ isAdmin }: AIProcessingControlsProps) {
  const query = trpc.workspace.getAIProcessingControls.useQuery();
  const update = trpc.workspace.updateAIProcessingControls.useMutation({
    onSuccess: () => query.refetch(),
  });
  const [draft, setDraft] = useState<AIControlState | null>(null);

  useEffect(() => {
    if (query.data) {
      setDraft(query.data);
    }
  }, [query.data]);

  if (!draft) {
    return (
      <section className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Loading AI processing controls…</p>
      </section>
    );
  }

  const rows: Array<{
    key: keyof AIControlState;
    label: string;
    description: string;
  }> = [
    {
      key: "aiGenerationEnabled",
      label: "AI Story Generation",
      description:
        "Generate story packs from source material using AI. When disabled, manual story creation only.",
    },
    {
      key: "aiQaAutoFixEnabled",
      label: "AI QA Auto-Fix",
      description:
        "Automatically rewrite flagged acceptance criteria using AI. When disabled, users edit manually.",
    },
    {
      key: "aiSelfReviewEnabled",
      label: "AI Self-Review",
      description:
        "Run a secondary AI review pass to catch hallucinations. When disabled, deterministic checks only.",
    },
    {
      key: "aiTopicExtractionEnabled",
      label: "AI Topic Extraction",
      description:
        "Analyse source material to identify requirement topics before generation.",
    },
    {
      key: "aiEmbeddingEnabled",
      label: "Embedding Generation",
      description:
        "Generate text embeddings for semantic search and evidence linking. Disabling this reduces core functionality.",
    },
  ];

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">AI Processing Controls</h2>
        <span className="text-xs text-muted-foreground">
          {isAdmin ? "Admin only" : "Read-only"}
        </span>
      </div>
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.description}</p>
            </div>
            <select
              value={valueToLabel(draft[row.key])}
              disabled={!isAdmin || update.isPending}
              onChange={(event) => {
                const nextValue = labelToValue(event.target.value as "Enabled" | "Disabled");
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        [row.key]: nextValue,
                      }
                    : current
                );
              }}
              className="rounded-md border px-2 py-1 text-sm disabled:opacity-60"
            >
              <option>Enabled</option>
              <option>Disabled</option>
            </select>
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className="mt-4">
          <button
            onClick={() => update.mutate({ controls: draft })}
            disabled={update.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </section>
  );
}
