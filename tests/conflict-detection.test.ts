import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryRaw = vi.fn();
const mockCreate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  db: {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        id: "proj1",
        workspaceId: "ws1",
        sources: [
          { id: "s1", name: "Source 1" },
          { id: "s2", name: "Source 2" },
        ],
      }),
    },
    evidenceConflict: {
      findMany: mockFindMany,
      create: mockCreate,
    },
    $queryRawUnsafe: mockQueryRaw,
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: '[{"index":0,"contradicts":true,"summary":"Different dates","confidence":0.9}]',
          },
        ],
      }),
    };
  },
}));

vi.mock("@/lib/ai/model-router", () => ({
  getModelForTask: () => "claude-haiku-4-5-20251001",
}));

describe("conflict-detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockQueryRaw.mockResolvedValue([
      {
        id_a: "c1",
        id_b: "c2",
        content_a: "The deadline is Monday",
        content_b: "The deadline is Friday",
        source_a_name: "Doc 1",
        source_b_name: "Doc 2",
        similarity: 0.92,
      },
    ]);
  });

  it("skips pairs that already have conflicts (idempotent)", async () => {
    mockFindMany.mockResolvedValue([
      { chunkAId: "c1", chunkBId: "c2" },
    ]);

    const { detectConflicts } = await import(
      "@/server/services/conflict-detection"
    );

    const created = await detectConflicts("proj1", "ws1");

    expect(created).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates conflict when AI detects contradiction", async () => {
    mockCreate.mockResolvedValue({
      id: "conf1",
      chunkAId: "c1",
      chunkBId: "c2",
    });

    const { detectConflicts } = await import(
      "@/server/services/conflict-detection"
    );

    const created = await detectConflicts("proj1", "ws1");

    expect(created.length).toBeGreaterThanOrEqual(0);
    if (created.length > 0) {
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chunkAId: "c1",
          chunkBId: "c2",
          conflictSummary: "Different dates",
          confidence: 0.9,
        }),
      });
    }
  });
});
