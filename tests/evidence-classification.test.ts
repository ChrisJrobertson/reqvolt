import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/server/db", () => ({
  db: {
    sourceChunk: { update: mockUpdate },
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '[{"chunkId":"c1","tag":"REQUIREMENT","confidence":0.9}]',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
  },
}));

vi.mock("@/lib/ai/model-router", () => ({
  getModelForTask: () => "claude-haiku-4-5-20251001",
  trackModelUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("evidence-classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies chunks and updates database", async () => {
    const { classifyChunks } = await import(
      "@/server/services/evidence-classification"
    );

    const chunks = [{ id: "c1", content: "Users must be able to login" }];
    const results = await classifyChunks(chunks, "ws1");

    expect(results.length).toBeGreaterThanOrEqual(0);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({
        classificationTag: "REQUIREMENT",
        classificationConfidence: 0.9,
      }),
    });
  });
});
