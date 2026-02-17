"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { AIProcessingControls } from "@/components/workspace/AIProcessingControls";

interface DataProcessingPageClientProps {
  workspaceId: string;
  isAdmin: boolean;
}

export function DataProcessingPageClient({
  workspaceId,
  isAdmin,
}: DataProcessingPageClientProps) {
  const [taskType, setTaskType] = useState("");
  const [model, setModel] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const dateTo = useMemo(() => new Date().toISOString(), []);
  const dateFrom = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  const logQuery = trpc.aiProcessingLog.list.useQuery({
    dateFrom,
    dateTo,
    taskType: taskType || undefined,
    model: model || undefined,
    limit,
    offset,
  });
  const exportCsv = trpc.aiProcessingLog.exportCsv.useMutation();

  const rows = logQuery.data?.rows ?? [];
  const total = logQuery.data?.total ?? 0;
  const canNext = offset + limit < total;
  const canPrev = offset > 0;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Data flow</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-medium">Your documents</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Uploads, pasted notes, emails, API sources
            </p>
          </div>
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
            <p className="font-medium">Reqvolt infrastructure</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Neon PostgreSQL, Cloudflare R2, generated stories and evidence links
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium">AI processing</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Anthropic for generation/review, OpenAI for embeddings
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">AI processing guarantees</h2>
        <ul className="space-y-3 text-sm">
          <li>
            <p className="font-medium">🔒 Zero training on your data</p>
            <p className="text-muted-foreground">
              Anthropic does not use API inputs or outputs for model training.
            </p>
            <div className="mt-1 flex gap-2 text-xs">
              <a
                href="https://www.anthropic.com/policies/usage-policy"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Anthropic usage policy
              </a>
              <a
                href="https://docs.anthropic.com/en/docs/about-claude/pricing#data-retention"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Anthropic retention terms
              </a>
            </div>
          </li>
          <li>
            <p className="font-medium">🔒 Embedding generation</p>
            <p className="text-muted-foreground">
              Embeddings are generated via OpenAI API and not used for model training.
            </p>
            <a
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noreferrer"
              className="text-xs underline"
            >
              OpenAI API data usage policy
            </a>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">AI processing log</h2>
          <div className="flex items-center gap-2">
            <input
              placeholder="Task type"
              value={taskType}
              onChange={(event) => {
                setOffset(0);
                setTaskType(event.target.value);
              }}
              className="rounded-md border px-2 py-1 text-xs"
            />
            <input
              placeholder="Model"
              value={model}
              onChange={(event) => {
                setOffset(0);
                setModel(event.target.value);
              }}
              className="rounded-md border px-2 py-1 text-xs"
            />
            {isAdmin && (
              <button
                onClick={() => exportCsv.mutate({ dateFrom, dateTo })}
                className="rounded-md border px-2 py-1 text-xs"
              >
                Export CSV
              </button>
            )}
          </div>
        </div>
        {exportCsv.data?.url && (
          <p className="mb-2 text-xs">
            <a className="underline" href={exportCsv.data.url}>
              Download export
            </a>
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Task</th>
                <th className="py-2 pr-2">Model</th>
                <th className="py-2 pr-2">Provider</th>
                <th className="py-2 pr-2">Sources</th>
                <th className="py-2 pr-2">Tokens sent</th>
                <th className="py-2 pr-2">Tokens received</th>
                <th className="py-2 pr-2">Retention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-2">{new Date(row.date).toLocaleString()}</td>
                  <td className="py-2 pr-2">{row.taskType}</td>
                  <td className="py-2 pr-2">{row.model}</td>
                  <td className="py-2 pr-2">{row.provider}</td>
                  <td className="py-2 pr-2">{row.sourceIds.length}</td>
                  <td className="py-2 pr-2">{row.tokensSent}</td>
                  <td className="py-2 pr-2">{row.tokensReceived}</td>
                  <td className="py-2 pr-2">{row.dataRetention}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={8}>
                    No AI processing events in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span>
            Showing {rows.length} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => canPrev && setOffset((current) => Math.max(0, current - limit))}
              disabled={!canPrev}
              className="rounded-md border px-2 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => canNext && setOffset((current) => current + limit)}
              disabled={!canNext}
              className="rounded-md border px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-base font-semibold">Sub-processors</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-2">Service</th>
                <th className="py-2 pr-2">Purpose</th>
                <th className="py-2 pr-2">Retention</th>
                <th className="py-2 pr-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  service: "Anthropic (Claude)",
                  purpose: "Story generation, self-review, QA tasks",
                  retention: "None (commercial API)",
                  link: "https://docs.anthropic.com/en/docs/about-claude/pricing#data-retention",
                },
                {
                  service: "OpenAI",
                  purpose: "Embeddings for semantic search",
                  retention: "None (API policy)",
                  link: "https://openai.com/policies/api-data-usage-policies",
                },
                {
                  service: "Neon",
                  purpose: "Primary database",
                  retention: "Until deletion",
                  link: "https://neon.tech/docs/security/security-overview",
                },
                {
                  service: "Cloudflare R2",
                  purpose: "File storage",
                  retention: "Until deletion",
                  link: "https://www.cloudflare.com/trust-hub/privacy-and-data-protection/",
                },
                {
                  service: "Clerk",
                  purpose: "Authentication",
                  retention: "Until account deletion",
                  link: "https://clerk.com/legal/privacy",
                },
                {
                  service: "Vercel",
                  purpose: "Hosting",
                  retention: "Transient",
                  link: "https://vercel.com/legal/privacy-policy",
                },
                {
                  service: "Inngest",
                  purpose: "Background jobs",
                  retention: "7-day logs",
                  link: "https://www.inngest.com/privacy",
                },
                {
                  service: "Upstash Redis",
                  purpose: "Caching",
                  retention: "TTL based",
                  link: "https://upstash.com/privacy",
                },
                {
                  service: "Sentry",
                  purpose: "Error monitoring",
                  retention: "30 days",
                  link: "https://sentry.io/privacy/",
                },
                {
                  service: "Resend",
                  purpose: "Email delivery",
                  retention: "Transient",
                  link: "https://resend.com/legal/privacy-policy",
                },
              ].map((entry) => (
                <tr key={entry.service} className="border-b">
                  <td className="py-2 pr-2">{entry.service}</td>
                  <td className="py-2 pr-2">{entry.purpose}</td>
                  <td className="py-2 pr-2">{entry.retention}</td>
                  <td className="py-2 pr-2">
                    <a href={entry.link} target="_blank" rel="noreferrer" className="underline">
                      Terms
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-base font-semibold">Data Processing Agreement</h2>
        <p className="text-sm text-muted-foreground">
          Download the Reqvolt Data Processing Agreement template for legal review.
        </p>
        <Link
          href="/legal/reqvolt-dpa.pdf"
          className="mt-3 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Download DPA (PDF)
        </Link>
      </section>

      <AIProcessingControls isAdmin={isAdmin} />
    </div>
  );
}
