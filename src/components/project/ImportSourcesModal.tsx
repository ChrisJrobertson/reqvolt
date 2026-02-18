"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { SourceType } from "@prisma/client";
import { FileSpreadsheet, GitBranch, BookOpen } from "lucide-react";

interface ImportSourcesModalProps {
  projectId: string;
  workspaceId: string;
  hasJiraConnection: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cell += c;
    } else if (c === "," || c === "\t") {
      current.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      current.push(cell.trim());
      cell = "";
      if (current.some((x) => x)) rows.push(current);
      current = [];
    } else {
      cell += c;
    }
  }
  if (cell || current.length) {
    current.push(cell.trim());
    if (current.some((x) => x)) rows.push(current);
  }
  return rows;
}

export function ImportSourcesModal({
  projectId,
  workspaceId,
  hasJiraConnection,
  onClose,
  onSuccess,
}: ImportSourcesModalProps) {
  const [tab, setTab] = useState<"csv" | "jira" | "confluence">("csv");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [nameCol, setNameCol] = useState("");
  const [contentCol, setContentCol] = useState("");
  const [typeCol, setTypeCol] = useState("");
  const [jql, setJql] = useState("project = PROJ AND type = Story");
  const [packName, setPackName] = useState("");
  const [confluenceSpace, setConfluenceSpace] = useState("");
  const [confluenceQuery, setConfluenceQuery] = useState("");
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();
  const csvImport = trpc.import.csvSources.useMutation({
    onSuccess: () => {
      utils.project.getById.invalidate({ projectId });
      onSuccess();
    },
  });
  const jiraAsPack = trpc.import.jiraIssuesAsPack.useMutation({
    onSuccess: (data) => {
      utils.project.getById.invalidate({ projectId });
      window.location.href = `/workspace/${workspaceId}/projects/${projectId}/packs/${data.packId}`;
    },
  });
  const jiraAsSources = trpc.import.jiraIssuesAsSources.useMutation({
    onSuccess: () => {
      utils.project.getById.invalidate({ projectId });
      onSuccess();
    },
  });
  const confluenceImport = trpc.import.confluencePages.useMutation({
    onSuccess: () => {
      utils.project.getById.invalidate({ projectId });
      onSuccess();
    },
  });

  const { data: jiraPreview } = trpc.import.jiraPreview.useQuery(
    { jql },
    { enabled: tab === "jira" && !!jql }
  );
  const { data: memberData } = trpc.workspace.getCurrentMember.useQuery(undefined, {
    enabled: tab === "jira" && hasJiraConnection,
  });
  const isAdmin = memberData?.role === "Admin";
  const { data: spacesData } = trpc.import.confluenceSpaces.useQuery(undefined, {
    enabled: tab === "confluence",
  });
  const { data: pagesData } = trpc.import.confluenceSearch.useQuery(
    { spaceKey: confluenceSpace, query: confluenceQuery || undefined },
    { enabled: tab === "confluence" && !!confluenceSpace }
  );

  const handleCsvFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const rows = parseCSV(text);
      if (rows.length > 0) {
        setCsvHeaders(rows[0] ?? []);
        setCsvRows(rows.slice(1));
        setNameCol(rows[0]?.[0] ?? "");
        setContentCol(rows[0]?.[1] ?? rows[0]?.[0] ?? "");
        setTypeCol("");
      } else {
        setCsvHeaders([]);
        setCsvRows([]);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleCsvImport = () => {
    if (!nameCol || !contentCol || csvRows.length === 0) return;
    const nameIdx = csvHeaders.indexOf(nameCol);
    const contentIdx = csvHeaders.indexOf(contentCol);
    const typeIdx = typeCol ? csvHeaders.indexOf(typeCol) : -1;
    if (nameIdx < 0 || contentIdx < 0) return;

    const rows = csvRows.map((row) => {
      const name = row[nameIdx] ?? "Imported";
      const content = row[contentIdx] ?? "";
      let type: SourceType = SourceType.OTHER;
      if (typeIdx >= 0 && row[typeIdx]) {
        const t = row[typeIdx]?.toUpperCase().replace(/\s+/g, "_");
        if (Object.values(SourceType).includes(t as SourceType)) {
          type = t as SourceType;
        }
      }
      const metadata: Record<string, unknown> = {};
      csvHeaders.forEach((h, i) => {
        if (i !== nameIdx && i !== contentIdx && i !== typeIdx && row[i]) {
          metadata[h] = row[i];
        }
      });
      return { name, content, type, metadata };
    });

    csvImport.mutate({ projectId, rows });
  };

  const togglePage = (id: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Import Sources</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setTab("csv")}
            className={`px-4 py-2 flex items-center gap-2 text-sm ${
              tab === "csv" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </button>
          {hasJiraConnection && (
            <>
              <button
                onClick={() => setTab("jira")}
                className={`px-4 py-2 flex items-center gap-2 text-sm ${
                  tab === "jira" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"
                }`}
              >
                <GitBranch className="h-4 w-4" />
                Jira
              </button>
              <button
                onClick={() => setTab("confluence")}
                className={`px-4 py-2 flex items-center gap-2 text-sm ${
                  tab === "confluence"
                    ? "border-b-2 border-primary font-medium"
                    : "text-muted-foreground"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Confluence
              </button>
            </>
          )}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {tab === "csv" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">CSV or TSV file</label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleCsvFile}
                  className="block w-full text-sm"
                />
              </div>
              {csvRows.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name column</label>
                      <select
                        value={nameCol}
                        onChange={(e) => setNameCol(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Content column</label>
                      <select
                        value={contentCol}
                        onChange={(e) => setContentCol(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Type column (optional)</label>
                      <select
                        value={typeCol}
                        onChange={(e) => setTypeCol(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">—</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Preview: first 5 rows
                  </div>
                  <div className="border rounded overflow-x-auto max-h-32 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          {csvHeaders.map((h) => (
                            <th key={h} className="px-2 py-1 text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-t">
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1 truncate max-w-[120px]">
                                {cell?.slice(0, 50)}
                                {cell && cell.length > 50 ? "…" : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={handleCsvImport}
                    disabled={csvImport.isPending || !nameCol || !contentCol}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {csvImport.isPending ? "Importing…" : `Import ${csvRows.length} sources`}
                  </button>
                </>
              )}
            </div>
          )}

          {tab === "jira" && hasJiraConnection && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">JQL</label>
                <input
                  type="text"
                  value={jql}
                  onChange={(e) => setJql(e.target.value)}
                  placeholder="project = PROJ AND type = Story"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              {jiraPreview?.connected && (
                <p className="text-sm text-muted-foreground">
                  {jiraPreview.count} issue{jiraPreview.count !== 1 ? "s" : ""} match
                </p>
              )}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Pack name (for Import as Pack)</label>
                  <input
                    type="text"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder="Import from Jira"
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    onClick={() =>
                      jiraAsPack.mutate({
                        projectId,
                        jql,
                        packName: packName || "Import from Jira",
                      })
                    }
                    disabled={jiraAsPack.isPending || !jql || (jiraPreview?.count ?? 0) === 0}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {jiraAsPack.isPending ? "Importing…" : "Import as Pack"}
                  </button>
                )}
                <button
                  onClick={() => jiraAsSources.mutate({ projectId, jql })}
                  disabled={jiraAsSources.isPending || !jql || (jiraPreview?.count ?? 0) === 0}
                  className="px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  {jiraAsSources.isPending ? "Importing…" : "Import as Sources"}
                </button>
              </div>
            </div>
          )}

          {tab === "confluence" && hasJiraConnection && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Space</label>
                <select
                  value={confluenceSpace}
                  onChange={(e) => setConfluenceSpace(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select space</option>
                  {spacesData?.spaces?.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name} ({s.key})
                    </option>
                  ))}
                </select>
              </div>
              {confluenceSpace && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Search (optional)</label>
                    <input
                      type="text"
                      value={confluenceQuery}
                      onChange={(e) => setConfluenceQuery(e.target.value)}
                      placeholder="Filter pages"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded">
                    {pagesData?.pages?.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPages.has(p.id)}
                          onChange={() => togglePage(p.id)}
                        />
                        <span className="text-sm truncate">{p.title}</span>
                      </label>
                    ))}
                    {(!pagesData?.pages || pagesData.pages.length === 0) && (
                      <p className="p-4 text-sm text-muted-foreground">No pages found</p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      confluenceImport.mutate({
                        projectId,
                        pageIds: Array.from(selectedPages),
                      })
                    }
                    disabled={
                      confluenceImport.isPending || selectedPages.size === 0
                    }
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {confluenceImport.isPending
                      ? "Importing…"
                      : `Import ${selectedPages.size} page${selectedPages.size !== 1 ? "s" : ""}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
