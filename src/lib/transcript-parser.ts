/**
 * Transcript parser for meeting notes, Zoom/Teams exports, Otter, Fireflies.
 * Best-effort parsing — never throws. Returns usable segments even on failure.
 */

export interface TranscriptSegment {
  speaker: string | null;
  timestamp: string | null;
  timestampSeconds: number | null;
  text: string;
  startOffset: number;
  endOffset: number;
}

export type TranscriptFormat =
  | "vtt"
  | "srt"
  | "speaker_prefixed"
  | "timestamped"
  | "json"
  | "unknown";

const ARTEFACTS = [
  /\[inaudible\]/gi,
  /\[crosstalk\]/gi,
  /\(background noise\)/gi,
  /\[applause\]/gi,
  /\[laughter\]/gi,
  /\[music\]/gi,
  /\[silence\]/gi,
];

function stripArtefacts(text: string): string {
  let out = text;
  for (const re of ARTEFACTS) {
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function parseVttTimestamp(line: string): { seconds: number; formatted: string } | null {
  const match = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return null;
  const [, h, m, s, ms] = match;
  const seconds =
    parseInt(h!, 10) * 3600 +
    parseInt(m!, 10) * 60 +
    parseInt(s!, 10) +
    parseInt(ms!, 10) / 1000;
  const formatted = parseInt(h!, 10) > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  return { seconds, formatted };
}

function parseSrtTimestamp(line: string): { seconds: number; formatted: string } | null {
  const match = line.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return null;
  const [, h, m, s, ms] = match;
  const seconds =
    parseInt(h!, 10) * 3600 +
    parseInt(m!, 10) * 60 +
    parseInt(s!, 10) +
    parseInt(ms!, 10) / 1000;
  const formatted = parseInt(h!, 10) > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  return { seconds, formatted };
}

export function detectTranscriptFormat(
  content: string,
  fileExtension?: string
): TranscriptFormat {
  if (fileExtension) {
    const ext = fileExtension.toLowerCase().replace(/^\./, "");
    if (ext === "vtt") return "vtt";
    if (ext === "srt") return "srt";
    if (ext === "json") return "json";
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("WEBVTT")) return "vtt";
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/m.test(trimmed))
    return "srt";
  if (/^\s*\{\s*"transcript"\s*:/.test(trimmed) || /^\s*\[\s*\{[\s\S]*"speaker"/.test(trimmed))
    return "json";
  if (/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s+\w+:/m.test(trimmed)) return "timestamped";
  if (/^[\w\s\-]+:\s+.+/m.test(trimmed) || /^\[[\w\s\-]+\]\s+.+/m.test(trimmed))
    return "speaker_prefixed";

  return "unknown";
}

export function parseTranscript(
  content: string,
  format?: TranscriptFormat
): TranscriptSegment[] {
  const detected = format ?? detectTranscriptFormat(content);
  const segments: TranscriptSegment[] = [];

  try {
    if (detected === "vtt") {
      const lines = content.split(/\r?\n/);
      let i = 0;
      while (i < lines.length) {
        const line = lines[i]!;
        const timingMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
        if (timingMatch) {
          const ts = parseVttTimestamp(timingMatch[1]!);
          const nextLine = lines[i + 1];
          let text = "";
          let speaker: string | null = null;
          if (nextLine) {
            const speakerMatch = nextLine.match(/<v\s+([^>]+)>(.*)/);
            if (speakerMatch) {
              speaker = speakerMatch[1]!.trim();
              text = stripArtefacts(speakerMatch[2]!);
            } else {
              text = stripArtefacts(nextLine);
            }
          }
          const startOffset = content.indexOf(line);
          const endOffset = startOffset + line.length + (nextLine?.length ?? 0) + 1;
          if (text) {
            segments.push({
              speaker,
              timestamp: ts?.formatted ?? null,
              timestampSeconds: ts?.seconds ?? null,
              text,
              startOffset,
              endOffset,
            });
          }
          i += 2;
        } else {
          i++;
        }
      }
    } else if (detected === "srt") {
      const blocks = content.split(/\n\s*\n/);
      for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/);
        if (lines.length < 2) continue;
        const timingLine = lines.find((l) => l.includes("-->"));
        if (!timingLine) continue;
        const tsMatch = timingLine.match(/(\d{2}:\d{2}:\d{2},\d{3})/);
        const ts = tsMatch ? parseSrtTimestamp(timingLine) : null;
        const textLine = lines[lines.length - 1];
        if (!textLine) continue;
        const speakerMatch = textLine.match(/^([^:]+):\s*(.*)$/);
        const speaker = speakerMatch ? speakerMatch[1]!.trim() : null;
        const text = stripArtefacts(speakerMatch ? speakerMatch[2]! : textLine);
        if (text) {
          const startOffset = content.indexOf(block);
          segments.push({
            speaker,
            timestamp: ts?.formatted ?? null,
            timestampSeconds: ts?.seconds ?? null,
            text,
            startOffset,
            endOffset: startOffset + block.length,
          });
        }
      }
    } else if (detected === "json") {
      const parsed = JSON.parse(content) as {
        transcript?: Array<{ speaker?: string; start?: number; end?: number; text?: string }>;
      };
      const items = parsed.transcript ?? (Array.isArray(parsed) ? parsed : []);
      let offset = 0;
      for (const item of items) {
        const text = stripArtefacts(String(item.text ?? "").trim());
        if (text) {
          const start = item.start ?? 0;
          const formatted =
            start >= 3600
              ? `${Math.floor(start / 3600)}:${String(Math.floor((start % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(start % 60)).padStart(2, "0")}`
              : `${Math.floor(start / 60)}:${String(Math.floor(start % 60)).padStart(2, "0")}`;
          segments.push({
            speaker: item.speaker?.trim() ?? null,
            timestamp: formatted,
            timestampSeconds: typeof start === "number" ? start : null,
            text,
            startOffset: offset,
            endOffset: offset + text.length,
          });
          offset += text.length + 1;
        }
      }
    } else if (detected === "timestamped") {
      const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+([^:]+):\s*([\s\S]*?)(?=\n\[|\n\n|$)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const [, mm, ss, hh] = m;
        const timestampSeconds = (parseInt(hh ?? "0", 10) || 0) * 3600 +
          (parseInt(mm!, 10) || 0) * 60 +
          (parseInt(ss!, 10) || 0);
        const formatted = `${mm}:${ss}`;
        const speaker = m[4]!.trim();
        const text = stripArtefacts(m[5]!.trim());
        if (text) {
          segments.push({
            speaker,
            timestamp: formatted,
            timestampSeconds,
            text,
            startOffset: m.index,
            endOffset: m.index + m[0].length,
          });
        }
      }
    } else if (detected === "speaker_prefixed") {
      const lines = content.split(/\r?\n/);
      let offset = 0;
      for (const line of lines) {
        const prefixed = line.match(/^([^:\[\]]+):\s*(.*)$/) ?? line.match(/^\[([^\]]+)\]\s*(.*)$/);
        const speaker = prefixed ? prefixed[1]!.trim() : null;
        const text = stripArtefacts(prefixed ? prefixed[2]! : line);
        if (text) {
          segments.push({
            speaker,
            timestamp: null,
            timestampSeconds: null,
            text,
            startOffset: offset,
            endOffset: offset + line.length,
          });
        }
        offset += line.length + 1;
      }
    }
  } catch {
    // Fall through to fallback
  }

  if (segments.length === 0) {
    const cleaned = stripArtefacts(content.trim());
    return [
      {
        speaker: null,
        timestamp: null,
        timestampSeconds: null,
        text: cleaned || content,
        startOffset: 0,
        endOffset: content.length,
      },
    ];
  }

  return segments;
}
