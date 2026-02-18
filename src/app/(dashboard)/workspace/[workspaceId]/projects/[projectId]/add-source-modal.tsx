"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { SourceType } from "@prisma/client";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: SourceType.MEETING_NOTES, label: "Meeting Notes" },
  { value: SourceType.CUSTOMER_FEEDBACK, label: "Customer Feedback" },
  { value: SourceType.WORKSHOP_NOTES, label: "Workshop Notes" },
  { value: SourceType.RETRO_NOTES, label: "Retro Notes" },
  { value: SourceType.INTERVIEW_TRANSCRIPT, label: "Interview Transcript" },
  { value: SourceType.OTHER, label: "Other" },
];

export function AddSourceModal({
  projectId,
  workspaceId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<"notes" | "email" | "file">("notes");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<SourceType>(SourceType.MEETING_NOTES);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const createText = trpc.source.createText.useMutation({
    onSuccess: () => onSuccess(),
  });
  const createEmail = trpc.source.createEmail.useMutation({
    onSuccess: () => onSuccess(),
  });
  const requestUploadUrl = trpc.upload.requestUploadUrl.useMutation();
  const confirmUpload = trpc.upload.confirmUpload.useMutation({
    onSuccess: () => onSuccess(),
  });

  const handleSubmitNotes = (e: React.FormEvent) => {
    e.preventDefault();
    const nameToUse = name || `${SOURCE_TYPES.find((t) => t.value === type)?.label ?? type} - ${new Date().toLocaleDateString("en-GB")}`;
    createText.mutate({
      projectId,
      type,
      name: nameToUse,
      content,
    });
  };

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    createEmail.mutate({
      projectId,
      subject: emailSubject,
      body: emailBody,
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadProgress(0);

    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File exceeds 50MB limit");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only PDF and DOCX files are supported");
      return;
    }

    try {
      const { uploadUrl, objectKey, sessionId } =
        await requestUploadUrl.mutateAsync({
          projectId,
          fileName: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      await confirmUpload.mutateAsync({
        sessionId,
        objectKey,
        projectId,
        fileName: file.name,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Add Source</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            🔒 Your documents are stored securely in Reqvolt&apos;s database and are never used for AI training.{" "}
            <a href={`/workspace/${workspaceId}/settings/data-processing`} className="underline">Learn more</a>
          </p>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab("notes")}
              className={`px-4 py-2 rounded-lg ${
                tab === "notes" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              Paste Notes
            </button>
            <button
              onClick={() => setTab("email")}
              className={`px-4 py-2 rounded-lg ${
                tab === "email" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              Paste Email
            </button>
            <button
              onClick={() => setTab("file")}
              className={`px-4 py-2 rounded-lg ${
                tab === "file" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              Upload File
            </button>
          </div>

          {tab === "notes" && (
            <form onSubmit={handleSubmitNotes} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SourceType)}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto-generated from type + date"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste your notes here..."
                  rows={8}
                  required
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createText.isPending || !content.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                >
                  {createText.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {tab === "email" && (
            <form onSubmit={handleSubmitEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                  required
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Body</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Paste email body..."
                  rows={8}
                  required
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEmail.isPending || !emailSubject.trim() || !emailBody.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                >
                  {createEmail.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {tab === "file" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload PDF or DOCX (max 50MB). Text will be extracted in the background.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelect}
                className="w-full"
              />
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              {uploadError && (
                <p className="text-sm text-red-600">{uploadError}</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
