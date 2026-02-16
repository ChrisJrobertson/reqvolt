"use client";

import { useState } from "react";

export function EmailForwardingCard({
  forwardingEmail,
  recentEmailCount = 0,
}: {
  forwardingEmail: string | null;
  recentEmailCount?: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!forwardingEmail) return;
    await navigator.clipboard.writeText(forwardingEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!forwardingEmail) return null;

  return (
    <section className="p-4 border rounded-lg bg-muted/30 max-w-lg">
      <h2 className="text-lg font-semibold mb-2">Email forwarding</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Forward emails to this address to add them as sources. Only workspace
        members can ingest emails.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-background border rounded text-sm truncate">
          {forwardingEmail}
        </code>
        <button
          onClick={handleCopy}
          className="px-3 py-2 border rounded-lg text-sm hover:bg-muted shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {recentEmailCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {recentEmailCount} email{recentEmailCount !== 1 ? "s" : ""} ingested
          recently
        </p>
      )}
    </section>
  );
}
