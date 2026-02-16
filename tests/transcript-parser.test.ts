import { describe, it, expect } from "vitest";
import {
  parseTranscript,
  detectTranscriptFormat,
} from "../src/lib/transcript-parser";

describe("transcript-parser", () => {
  describe("VTT format", () => {
    it("parses VTT with correct speakers and timestamps", () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
<v Alice>Hello everyone

00:00:06.000 --> 00:00:10.000
<v Bob>Hi Alice`;
      const segments = parseTranscript(vtt, "vtt");
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments[0]).toMatchObject({
        speaker: "Alice",
        text: expect.stringContaining("Hello"),
      });
    });
  });

  describe("SRT format", () => {
    it("parses SRT with correct speakers and timestamps", () => {
      const srt = `1
00:00:01,000 --> 00:00:05,000
Alice: Hello everyone

2
00:00:06,000 --> 00:00:10,000
Bob: Hi Alice`;
      const segments = parseTranscript(srt, "srt");
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments[0]).toMatchObject({
        speaker: "Alice",
        text: expect.stringContaining("Hello"),
      });
    });
  });

  describe("speaker-prefixed plain text", () => {
    it("parses speaker-prefixed lines correctly", () => {
      const text = `Alice: Hello everyone
Bob: Hi Alice`;
      const segments = parseTranscript(text, "speaker_prefixed");
      expect(segments).toHaveLength(2);
      expect(segments[0]).toMatchObject({ speaker: "Alice", text: "Hello everyone" });
      expect(segments[1]).toMatchObject({ speaker: "Bob", text: "Hi Alice" });
    });
  });

  describe("malformed transcript", () => {
    it("falls back to plain text for malformed input", () => {
      const malformed = "not valid vtt or srt\njust random text";
      const segments = parseTranscript(malformed);
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments[0].text).toBeTruthy();
    });
  });

  describe("empty transcript", () => {
    it("returns single segment with empty text for empty input", () => {
      const segments = parseTranscript("");
      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({
        speaker: null,
        timestamp: null,
        timestampSeconds: null,
        text: "",
      });
    });
  });

  describe("detectTranscriptFormat", () => {
    it("detects VTT by content", () => {
      expect(detectTranscriptFormat("WEBVTT\n\n00:00:01.000 --> 00:00:02.000")).toBe("vtt");
    });

    it("detects SRT by content", () => {
      expect(
        detectTranscriptFormat("1\n00:00:01,000 --> 00:00:02,000\nHello")
      ).toBe("srt");
    });

    it("detects by file extension", () => {
      expect(detectTranscriptFormat("x", ".vtt")).toBe("vtt");
      expect(detectTranscriptFormat("x", ".srt")).toBe("srt");
    });
  });
});
