import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { buildTraceabilityGraphData } from "../src/server/services/traceability-graph";

vi.mock("@/server/db", () => ({
  db: {
    pack: { findFirst: vi.fn() },
    source: { findMany: vi.fn() },
    evidenceLink: { findMany: vi.fn() },
  },
}));

describe("buildTraceabilityGraphData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds source-story-AC-evidence-chunk graph payload", async () => {
    vi.mocked(db.pack.findFirst).mockResolvedValue({
      id: "pack-1",
      name: "Compliance Pack",
      versions: [
        {
          id: "ver-1",
          versionNumber: 4,
          sourceIds: ["src-1"],
          qaFlags: [
            {
              entityType: "acceptance_criteria",
              entityId: "ac-1",
              severity: "medium",
            },
          ],
          stories: [
            {
              id: "story-1",
              sortOrder: 0,
              persona: "compliance officer",
              want: "export audit reports",
              acceptanceCriteria: [
                {
                  id: "ac-1",
                  sortOrder: 0,
                  given: "Given a regulated tenant",
                  when: "When audit export is requested",
                  then: "Then evidence is exported",
                },
              ],
            },
          ],
        },
      ],
    } as never);

    vi.mocked(db.source.findMany).mockResolvedValue([
      {
        id: "src-1",
        name: "Client brief",
        type: "PDF",
        content: "A".repeat(2050),
        _count: { chunks: 6 },
      },
    ] as never);

    vi.mocked(db.evidenceLink.findMany).mockResolvedValue([
      {
        id: "ev-1",
        entityType: "acceptance_criteria",
        entityId: "ac-1",
        confidence: "high",
        sourceChunk: {
          id: "chunk-1",
          content: "We need SSO and audit export support for enterprise clients.",
          chunkIndex: 13,
          source: {
            id: "src-1",
            name: "Client brief",
            type: "PDF",
          },
        },
      },
      {
        id: "ev-2",
        entityType: "story",
        entityId: "story-1",
        confidence: "medium",
        sourceChunk: {
          id: "chunk-2",
          content: "Reporting obligations require complete audit log export capability.",
          chunkIndex: 21,
          source: {
            id: "src-1",
            name: "Client brief",
            type: "PDF",
          },
        },
      },
    ] as never);

    const payload = await buildTraceabilityGraphData({
      workspaceId: "ws-1",
      packId: "pack-1",
    });

    expect(payload.packId).toBe("pack-1");
    expect(payload.packVersionId).toBe("ver-1");
    expect(payload.versionNumber).toBe(4);
    expect(payload.stats.sources).toBe(1);
    expect(payload.stats.stories).toBe(1);
    expect(payload.stats.acceptanceCriteria).toBe(1);
    expect(payload.stats.evidenceLinks).toBe(2);
    expect(payload.stats.chunks).toBe(2);
    expect(payload.stats.coverage).toBe(100);

    expect(payload.nodes.some((node) => node.id === "source:src-1")).toBe(true);
    expect(payload.nodes.some((node) => node.id === "story:story-1")).toBe(true);
    expect(payload.nodes.some((node) => node.id === "ac:ac-1")).toBe(true);
    expect(payload.edges.some((edge) => edge.edgeType === "source-to-story")).toBe(true);
    expect(payload.edges.some((edge) => edge.edgeType === "story-to-ac")).toBe(true);
    expect(payload.edges.some((edge) => edge.edgeType === "ac-to-evidence")).toBe(true);
    expect(payload.edges.some((edge) => edge.edgeType === "evidence-to-chunk")).toBe(true);
  });

  it("throws when pack cannot be found in workspace", async () => {
    vi.mocked(db.pack.findFirst).mockResolvedValue(null);

    await expect(
      buildTraceabilityGraphData({
        workspaceId: "ws-missing",
        packId: "pack-missing",
      })
    ).rejects.toThrow("Pack not found");
  });
});
