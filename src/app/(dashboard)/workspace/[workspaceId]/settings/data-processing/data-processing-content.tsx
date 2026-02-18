"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AIProcessingControls } from "@/components/workspace/AIProcessingControls";
import { ExternalLink } from "lucide-react";

const SUB_PROCESSORS = [
  {
    service: "Anthropic (Claude)",
    purpose: "AI story generation, QA auto-fix, self-review",
    dataHandled: "Source text chunks (not full documents)",
    retention: "None — zero retention on commercial API",
    region: "US",
    link: "https://www.anthropic.com/legal/commercial-terms",
  },
  {
    service: "OpenAI",
    purpose: "Text embedding generation for semantic search",
    dataHandled: "Source text chunks",
    retention: "None — zero retention on API",
    region: "US",
    link: "https://openai.com/policies/api-data-usage-policies",
  },
  {
    service: "Neon",
    purpose: "Primary database",
    dataHandled: "All workspace data",
    retention: "Until deletion",
    region: "Configurable (US/EU)",
    link: "https://neon.tech/legal/privacy-policy",
  },
  {
    service: "Cloudflare R2",
    purpose: "File storage",
    dataHandled: "Uploaded documents, export files",
    retention: "Until deletion",
    region: "Configurable",
    link: "https://www.cloudflare.com/legal/privacy-policy/",
  },
  {
    service: "Clerk",
    purpose: "Authentication",
    dataHandled: "User identity (name, email)",
    retention: "Until account deletion",
    region: "US",
    link: "https://clerk.com/legal/privacy-policy",
  },
  {
    service: "Vercel",
    purpose: "Application hosting",
    dataHandled: "Request/response data (transient)",
    retention: "Transient only",
    region: "Global edge",
    link: "https://vercel.com/legal/privacy-policy",
  },
  {
    service: "Inngest",
    purpose: "Background job processing",
    dataHandled: "Job metadata, task payloads",
    retention: "7-day log retention",
    region: "US",
    link: "https://www.inngest.com/legal/privacy",
  },
  {
    service: "Upstash Redis",
    purpose: "Caching, rate limiting",
    dataHandled: "Cached queries, rate limit counters",
    retention: "TTL-based (minutes to hours)",
    region: "Configurable",
    link: "https://upstash.com/legal/privacy-policy",
  },
];

export function DataProcessingContent({
  workspaceId,
  isAdmin,
}: {
  workspaceId: string;
  isAdmin: boolean;
}) {
  const [logDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });

  const { data: logEntries } = trpc.aiProcessingLog.list.useQuery({
    workspaceId,
    dateFrom: logDateFrom,
    limit: 50,
  });

  return (
    <div className="space-y-10">
      {/* Data flow diagram */}
      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Data Flow</h2>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <div className="px-4 py-3 rounded-lg bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <p className="font-medium">Your Documents</p>
            <p className="text-muted-foreground text-xs">upload / paste / email / API</p>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="px-4 py-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
            <p className="font-medium">Reqvolt Database</p>
            <p className="text-muted-foreground text-xs">Neon PostgreSQL</p>
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="px-4 py-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
            <p className="font-medium">AI Processing</p>
            <p className="text-muted-foreground text-xs">Anthropic API · Retains: nothing</p>
          </div>
        </div>
      </section>

      {/* AI Processing Guarantees */}
      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">AI Processing Guarantees</h2>
        <ul className="space-y-3 text-sm">
          <li>
            <span className="font-medium">Zero training on your data</span>
            <p className="text-muted-foreground">
              Anthropic does not use API inputs or outputs for model training. This is a contractual
              commitment in their commercial API terms.
            </p>
            <a
              href="https://www.anthropic.com/legal/consumer-terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Anthropic usage policy <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <span className="font-medium">Zero retention after processing</span>
            <p className="text-muted-foreground">
              Source material sent to the AI API for story generation is processed and discarded.
              Anthropic does not retain prompt or response data from commercial API usage.
            </p>
          </li>
          <li>
            <span className="font-medium">No cross-customer data sharing</span>
            <p className="text-muted-foreground">
              Your workspace data is isolated at the database level. Source material from your
              workspace is never included in processing for other workspaces.
            </p>
          </li>
          <li>
            <span className="font-medium">Embedding generation</span>
            <p className="text-muted-foreground">
              Text embeddings for semantic search are generated via OpenAI&apos;s API, which does not
              train on API inputs.
            </p>
            <a
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              OpenAI data usage <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        </ul>
      </section>

      {/* AI Processing Log */}
      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">AI Processing Log</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Audit trail of AI API calls for this workspace (last 30 days).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Task</th>
                <th className="text-left p-2">Model</th>
                <th className="text-right p-2">Tokens</th>
                <th className="text-left p-2">Retention</th>
              </tr>
            </thead>
            <tbody>
              {logEntries?.map((entry) => (
                <tr key={entry.id} className="border-b">
                  <td className="p-2">{new Date(entry.date).toLocaleString()}</td>
                  <td className="p-2">{String(entry.taskType)}</td>
                  <td className="p-2">{String(entry.model)}</td>
                  <td className="p-2 text-right">{Number(entry.tokensSent) + Number(entry.tokensReceived)}</td>
                  <td className="p-2">{String(entry.retention)}</td>
                </tr>
              ))}
              {(!logEntries || logEntries.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No AI processing events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sub-processors */}
      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Sub-processors</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Service</th>
                <th className="text-left p-2">Purpose</th>
                <th className="text-left p-2">Data handled</th>
                <th className="text-left p-2">Retention</th>
                <th className="text-left p-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {SUB_PROCESSORS.map((row) => (
                <tr key={row.service} className="border-b">
                  <td className="p-2 font-medium">{row.service}</td>
                  <td className="p-2">{row.purpose}</td>
                  <td className="p-2">{row.dataHandled}</td>
                  <td className="p-2">{row.retention}</td>
                  <td className="p-2">
                    <a
                      href={row.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Terms <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* DPA Download */}
      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Data Processing Agreement</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download our Data Processing Agreement (DPA) template for review by your legal team.
        </p>
        <a
          href="/legal/reqvolt-dpa.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
        >
          View DPA (print to save as PDF)
        </a>
      </section>

      {/* AI Processing Controls */}
      {isAdmin && (
        <section>
          <AIProcessingControls workspaceId={workspaceId} />
        </section>
      )}
    </div>
  );
}
