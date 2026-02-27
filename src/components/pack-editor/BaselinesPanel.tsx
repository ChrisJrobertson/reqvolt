"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { GitBranch, Plus } from "lucide-react";

export function BaselinesPanel({
  packId,
  isApproved,
}: {
  packId: string;
  isApproved: boolean;
}) {
  const [note, setNote] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const showCompare = !!(compareA && compareB && compareA !== compareB);
  const [viewSnapshotId, setViewSnapshotId] = useState<string | null>(null);

  const { data: baselines } = trpc.baseline.list.useQuery({ packId });
  const { data: snapshot } = trpc.baseline.getSnapshot.useQuery(
    { baselineId: viewSnapshotId! },
    { enabled: !!viewSnapshotId }
  );
  const { data: diff } = trpc.baseline.compare.useQuery(
    { baselineAId: compareA, baselineBId: compareB },
    { enabled: showCompare }
  );
  const utils = trpc.useUtils();
  const createBaseline = trpc.baseline.create.useMutation({
    onSuccess: () => {
      setNote("");
      utils.baseline.list.invalidate({ packId });
      window.location.reload();
    },
  });

  return (
    <div className="border rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <GitBranch className="h-5 w-5" />
        Baselines
      </h2>

      {isApproved && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm flex-1"
          />
          <button
            onClick={() => createBaseline.mutate({ packId, note: note || undefined })}
            disabled={createBaseline.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create baseline
          </button>
        </div>
      )}

      {!isApproved && (
        <p className="text-sm text-muted-foreground mb-4">
          Approve the pack before creating a baseline.
        </p>
      )}

      {baselines && baselines.length > 1 && (
        <div className="mb-4 flex gap-2 items-center">
          <span className="text-sm">Compare:</span>
          <select
            value={compareA}
            onChange={(e) => setCompareA(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="">Select baseline A</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>{b.versionLabel}</option>
            ))}
          </select>
          <span className="text-sm">vs</span>
          <select
            value={compareB}
            onChange={(e) => setCompareB(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="">Select baseline B</option>
            {baselines.map((b) => (
              <option key={b.id} value={b.id}>{b.versionLabel}</option>
            ))}
          </select>
        </div>
      )}

      {baselines && baselines.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {baselines.map((b) => (
              <div
                key={b.id}
                className="p-3 border rounded-lg flex justify-between items-center"
              >
                <div>
                  <span className="font-medium">{b.versionLabel}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {new Date(b.createdAt).toLocaleDateString()} · {b.createdBy}
                  </span>
                  {b.note && (
                    <p className="text-sm text-muted-foreground mt-1">{b.note}</p>
                  )}
                </div>
                <button
                  onClick={() => setViewSnapshotId(viewSnapshotId === b.id ? null : b.id)}
                  className="text-sm text-primary hover:underline"
                >
                  View
                </button>
              </div>
            ))}
          </div>

          {showCompare && diff && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/30">
              <h3 className="font-semibold mb-2">Comparison</h3>
              <div className="text-sm space-y-2">
                {diff.addedStories.length > 0 && (
                  <p className="text-green-700">
                    +{diff.addedStories.length} story(ies) added
                  </p>
                )}
                {diff.removedStories.length > 0 && (
                  <p className="text-red-700">
                    -{diff.removedStories.length} story(ies) removed
                  </p>
                )}
                {diff.modifiedStories.length > 0 && (
                  <p className="text-amber-700">
                    ~{diff.modifiedStories.length} story(ies) modified
                  </p>
                )}
                {(diff.addedEvidenceLinks > 0 || diff.removedEvidenceLinks > 0) && (
                  <p className="text-muted-foreground">
                    Evidence: +{diff.addedEvidenceLinks} / -{diff.removedEvidenceLinks}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setCompareA("");
                  setCompareB("");
                }}
                className="mt-2 text-sm text-muted-foreground hover:underline"
              >
                Clear comparison
              </button>
            </div>
          )}

          {viewSnapshotId && snapshot && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/30 max-h-96 overflow-y-auto">
              <h3 className="font-semibold mb-2">{snapshot.versionLabel}</h3>
              <div className="text-sm space-y-2">
                {(snapshot.snapshotData as { stories: Array<{ persona: string; want: string; soThat: string }> }).stories?.map((s, i) => (
                  <div key={i} className="p-2 border rounded">
                    <p className="font-medium">{s.persona}</p>
                    <p className="text-muted-foreground">Want: {s.want}</p>
                    <p className="text-muted-foreground">So that: {s.soThat}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setViewSnapshotId(null)}
                className="mt-2 text-sm text-muted-foreground hover:underline"
              >
                Close
              </button>
            </div>
          )}
        </>
      )}

      {baselines && baselines.length === 0 && (
        <p className="text-sm text-muted-foreground">No baselines yet.</p>
      )}
    </div>
  );
}
