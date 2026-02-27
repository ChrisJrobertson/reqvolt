"use client";

import { useState, useEffect } from "react";

interface PackData {
  packName: string;
  projectName: string;
  versionNumber: number;
  summary: string | null;
  nonGoals: string | null;
  stories: Array<{
    id: string;
    persona: string;
    want: string;
    soThat: string;
    acceptanceCriteria: Array<{ given: string; when: string; then: string }>;
  }>;
  approvalScope: string;
  dueDate: string | null;
}

export function ApprovePageClient({ token }: { token: string }) {
  const [data, setData] = useState<PackData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"approve" | "request_changes" | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/approvals/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "Link expired" : "Not found");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!action) return;
    const res = await fetch(`/api/approvals/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        signatureName: action === "approve" ? signatureName : undefined,
        comments: action === "request_changes" ? comments : undefined,
      }),
    });
    if (res.ok) setSubmitted(true);
    else setError("Failed to submit");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-destructive">
            {error === "Link expired" ? "Approval link has expired" : "Approval link not found"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Please contact the pack owner for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-green-600">Thank you</h1>
          <p className="text-muted-foreground mt-2">
            Your response has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{data.packName}</h1>
        <p className="text-muted-foreground">
          {data.projectName} – Version {data.versionNumber}
        </p>
        {data.dueDate && (
          <p className="text-sm text-muted-foreground mt-1">
            Due: {new Date(data.dueDate).toLocaleDateString()}
          </p>
        )}
      </header>

      {data.summary && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Summary</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">User Stories</h2>
        <div className="space-y-6">
          {data.stories.map((story) => (
            <div key={story.id} className="p-4 border rounded-lg">
              <p className="font-medium">{story.persona}</p>
              <p className="text-muted-foreground mt-1">
                <strong>Want:</strong> {story.want}
              </p>
              <p className="text-muted-foreground">
                <strong>So that:</strong> {story.soThat}
              </p>
              <ul className="mt-3 space-y-2">
                {story.acceptanceCriteria.map((ac) => (
                  <li key={ac.given + ac.when} className="text-sm pl-4 border-l-2">
                    <strong>Given</strong> {ac.given}{" "}
                    <strong>When</strong> {ac.when}{" "}
                    <strong>Then</strong> {ac.then}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t pt-8">
        <h2 className="text-lg font-semibold mb-4">Your decision</h2>
        {!action ? (
          <div className="flex gap-4">
            <button
              onClick={() => setAction("approve")}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Approve
            </button>
            <button
              onClick={() => setAction("request_changes")}
              className="px-4 py-2 border rounded-lg hover:bg-muted"
            >
              Request changes
            </button>
          </div>
        ) : action === "approve" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Type your name to sign</span>
              <input
                type="text"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Your full name"
                className="block w-full mt-1 px-4 py-2 border rounded-lg"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="px-4 py-2 border rounded-lg">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!signatureName.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
              >
                Confirm approval
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium">Comments / requested changes</span>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Describe what changes are needed"
                className="block w-full mt-1 px-4 py-2 border rounded-lg"
                rows={4}
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="px-4 py-2 border rounded-lg">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!comments.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
