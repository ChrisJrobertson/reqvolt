import {
  ClipboardPaste,
  FileText,
  FileType,
  Mail,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

export function getSourceTypeIcon(sourceType: string): LucideIcon {
  const type = sourceType.toUpperCase();
  if (type === "PDF") return FileText;
  if (type === "DOCX") return FileType;
  if (type.includes("TRANSCRIPT")) return MessageSquare;
  if (type === "EMAIL") return Mail;
  return ClipboardPaste;
}

export function formatSourceType(sourceType: string): string {
  return sourceType
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

export function renderSourceTypeIcon(sourceType: string, size: number) {
  const Icon = getSourceTypeIcon(sourceType);
  return createElement(Icon, { size, "aria-hidden": true });
}
