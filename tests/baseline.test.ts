import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindFirst = vi.fn();
const mockAggregate = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    pack: {
      findFirst: mockFindFirst,
      update: mockUpdate,
    },
    baseline: {
      create: mockCreate,
      aggregate: mockAggregate,
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    evidenceLink: { findMany: vi.fn().mockResolvedValue([]) },
    qAFlag: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe("baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue({
      id: "pack1",
      workspaceId: "ws1",
      healthScore: 85,
      versions: [
        {
          id: "pv1",
          sourceIds: ["s1"],
          summary: "S",
          nonGoals: null,
          assumptions: [],
          decisions: [],
          risks: [],
          openQuestions: [],
          stories: [
            {
              id: "story1",
              sortOrder: 0,
              persona: "User",
              want: "X",
              soThat: "Y",
              acceptanceCriteria: [],
            },
          ],
        },
      ],
    });
    mockAggregate.mockResolvedValue({ _max: { versionNumber: null } });
    mockCreate.mockResolvedValue({
      id: "bl1",
      versionLabel: "Baseline v1",
      versionNumber: 1,
    });
  });

  it("createBaseline produces snapshot and updates pack", async () => {
    const { createBaseline } = await import("@/server/services/baseline");

    const result = await createBaseline("pack1", "ws1", "user1", "Test note");

    expect(result.versionLabel).toBe("Baseline v1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "ws1",
        packId: "pack1",
        versionLabel: "Baseline v1",
        versionNumber: 1,
        createdBy: "user1",
        note: "Test note",
      }),
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "pack1" },
      data: { lastBaselineId: "bl1", divergedFromBaseline: false },
    });
  });
});
