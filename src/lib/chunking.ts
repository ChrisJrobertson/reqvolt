/**
 * Text chunking for RAG pipeline.
 * Uses @langchain/textsplitters with 512 tokens, 50 overlap.
 * Transcript sources use speaker-turn boundaries.
 */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  detectTranscriptFormat,
  parseTranscript,
  type TranscriptSegment,
} from "./transcript-parser";

// ~512 tokens at ~4 chars per token
const CHUNK_SIZE = 2048;
const CHUNK_OVERLAP = 200;
const DEFAULT_MAX_TOKENS = 500;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

export interface ChunkResult {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  metadata?: { speaker: string | null; timestamp: string | null; timestampSeconds: number | null };
  startOffset?: number;
  endOffset?: number;
}

export interface TranscriptChunkResult {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  metadata: { speaker: string | null; timestamp: string | null; timestampSeconds: number | null };
  startOffset: number;
  endOffset: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitAtSentences(text: string, maxTokens: number): string[] {
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";
  let currentTokens = 0;
  for (const s of sentences) {
    const sTokens = estimateTokens(s);
    if (currentTokens + sTokens > maxTokens && current) {
      parts.push(current.trim());
      current = s;
      currentTokens = sTokens;
    } else {
      current += (current ? " " : "") + s;
      currentTokens += sTokens;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [text];
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxTokens: number = DEFAULT_MAX_TOKENS
): TranscriptChunkResult[] {
  const hasSpeaker = segments.some((s) => s.speaker);
  if (!hasSpeaker) {
    const fullText = segments.map((s) => s.text).join(" ");
    const parts = splitAtSentences(fullText, maxTokens);
    let offset = 0;
    return parts.map((content, i) => {
      const tokenCount = estimateTokens(content);
      const startOffset = offset;
      offset += content.length + (i < parts.length - 1 ? 1 : 0);
      return {
        content,
        tokenCount,
        chunkIndex: i,
        metadata: { speaker: null, timestamp: null, timestampSeconds: null },
        startOffset,
        endOffset: startOffset + content.length,
      };
    });
  }

  const results: TranscriptChunkResult[] = [];
  let chunkIndex = 0;
  let currentSpeaker: string | null = null;
  let currentText = "";
  let currentTokens = 0;
  let firstTimestamp: string | null = null;
  let firstTimestampSeconds: number | null = null;
  let startOffset = 0;

  for (const seg of segments) {
    const isSameSpeaker = seg.speaker === currentSpeaker;
    const segTokens = estimateTokens(seg.text);

    if (isSameSpeaker && currentTokens + segTokens <= maxTokens) {
      currentText += (currentText ? " " : "") + seg.text;
      currentTokens = estimateTokens(currentText);
      if (!firstTimestamp && seg.timestamp) {
        firstTimestamp = seg.timestamp;
        firstTimestampSeconds = seg.timestampSeconds;
      }
    } else {
      if (currentText) {
        const parts =
          currentTokens > maxTokens
            ? splitAtSentences(currentText, maxTokens)
            : [currentText];
        for (let i = 0; i < parts.length; i++) {
          results.push({
            content: parts[i]!,
            tokenCount: estimateTokens(parts[i]!),
            chunkIndex: chunkIndex++,
            metadata: {
              speaker: currentSpeaker,
              timestamp: i === 0 ? firstTimestamp : null,
              timestampSeconds: i === 0 ? firstTimestampSeconds : null,
            },
            startOffset,
            endOffset: startOffset + parts[i]!.length,
          });
          startOffset += parts[i]!.length + (i < parts.length - 1 ? 1 : 0);
        }
      }
      currentSpeaker = seg.speaker;
      currentText = seg.text;
      currentTokens = segTokens;
      firstTimestamp = seg.timestamp;
      firstTimestampSeconds = seg.timestampSeconds;
      startOffset = seg.startOffset;
    }
  }

  if (currentText) {
    const parts =
      currentTokens > maxTokens
        ? splitAtSentences(currentText, maxTokens)
        : [currentText];
    for (let i = 0; i < parts.length; i++) {
      results.push({
        content: parts[i]!,
        tokenCount: estimateTokens(parts[i]!),
        chunkIndex: chunkIndex++,
        metadata: {
          speaker: currentSpeaker,
          timestamp: i === 0 ? firstTimestamp : null,
          timestampSeconds: i === 0 ? firstTimestampSeconds : null,
        },
        startOffset,
        endOffset: startOffset + parts[i]!.length,
      });
    }
  }

  return results;
}

export async function chunkText(
  text: string,
  options?: { sourceType?: string; fileExtension?: string }
): Promise<ChunkResult[]> {
  const isTranscript =
    options?.sourceType === "TRANSCRIPT" || options?.sourceType === "transcript";

  if (isTranscript) {
    const format = detectTranscriptFormat(text, options?.fileExtension);
    const segments = parseTranscript(text, format);
    const hasSpeaker = segments.some((s) => s.speaker);
    if (hasSpeaker || format !== "unknown") {
      const transcriptChunks = chunkTranscript(segments, DEFAULT_MAX_TOKENS);
      return transcriptChunks.map((c) => ({
        content: c.content,
        tokenCount: c.tokenCount,
        chunkIndex: c.chunkIndex,
        metadata: c.metadata,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
      }));
    }
  }

  const chunks = await splitter.createDocuments([text]);
  return chunks.map((chunk, i) => ({
    content: chunk.pageContent,
    tokenCount: Math.ceil(chunk.pageContent.length / 4),
    chunkIndex: i,
  }));
}
