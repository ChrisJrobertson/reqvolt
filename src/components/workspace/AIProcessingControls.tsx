"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const CONTROLS = [
  {
    key: "aiGenerationEnabled" as const,
    label: "AI Story Generation",
    description:
      "Generate story packs from source material using AI. When disabled: manual story creation only. Sources are stored but never sent to any AI provider.",
  },
  {
    key: "aiQaAutoFixEnabled" as const,
    label: "AI QA Auto-Fix",
    description:
      "Automatically rewrite flagged acceptance criteria using AI. When disabled: QA flags are shown but auto-fix is unavailable. Users must edit acceptance criteria manually.",
  },
  {
    key: "aiSelfReviewEnabled" as const,
    label: "AI Self-Review",
    description:
      "Run a secondary AI review pass to catch hallucinations. When disabled: generation confidence is computed from deterministic checks only. No secondary AI call is made.",
  },
  {
    key: "aiTopicExtractionEnabled" as const,
    label: "AI Topic Extraction",
    description:
      "Analyse source material to identify requirement topics before generation. When disabled: readiness panel shows volume and structural checks only, not topic analysis.",
  },
  {
    key: "aiEmbeddingEnabled" as const,
    label: "Embedding Generation",
    description:
      "Generate text embeddings for semantic search and evidence linking via OpenAI API. When disabled: semantic search and evidence linking are unavailable. Sources stored as raw text.",
    warning: "Disabling this significantly reduces Reqvolt's core functionality.",
  },
];

type ControlItem = (typeof CONTROLS)[number];

export function AIProcessingControls({ workspaceId }: { workspaceId: string }) {
  const [saving, setSaving] = useState(false);
  const { data: controls, isLoading } = trpc.workspace.getAIProcessingControls.useQuery({
    workspaceId,
  });
  const utils = trpc.useUtils();
  const update = trpc.workspace.updateAIProcessingControls.useMutation({
    onSuccess: () => {
      utils.workspace.getAIProcessingControls.invalidate({ workspaceId });
      setSaving(false);
    },
    onError: () => setSaving(false),
  });

  const [local, setLocal] = useState<Record<string, boolean>>({});

  const current = { ...controls, ...local } as Record<string, boolean>;

  const handleChange = (key: (typeof CONTROLS)[number]["key"], value: boolean) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!controls) return;
    setSaving(true);
    const next = CONTROLS.reduce(
      (acc, c) => {
        acc[c.key] = current[c.key] ?? controls[c.key];
        return acc;
      },
      {} as Record<string, boolean>
    );
    update.mutate({ workspaceId, controls: next });
  };

  const hasChanges = CONTROLS.some((c) => local[c.key] !== undefined);

  if (isLoading || !controls) {
    return <p className="text-muted-foreground">Loading controls…</p>;
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-2">AI Processing Controls</h2>
      <p className="text-sm text-muted-foreground mb-4">Admin only</p>

      <div className="space-y-6">
        {CONTROLS.map((c: ControlItem) => (
          <div key={c.key}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                {"warning" in c && c.warning && (
                  <p className="text-sm text-amber-600 mt-1">⚠ {c.warning}</p>
                )}
              </div>
              <select
                value={current[c.key] ? "enabled" : "disabled"}
                onChange={(e) => handleChange(c.key, e.target.value === "enabled")}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {hasChanges && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      )}
    </div>
  );
}
