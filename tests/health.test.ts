import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/server/db";
import { computePackHealth } from "../src/server/services/health";

vi.mock("@/server/db", () => ({
  db: {
    pack: { findFirst: vi.fn() },
    sourceChunkDiff: { count: vi.fn() },
    acceptanceCriteria: { findMany: vi.fn() },
    evidenceLink: { findMany: vi.fn() },
    qAFlag: { findMany: vi.fn() },
    deliveryFeedback: { count: vi.fn() },
    source: { findMany: vi.fn() },
  },
}));

describe("health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns score 100 when all factors are 100%", async () => {
    const packId = "pack1";
    const versionId = "v1";
    const storyIds = ["s1", "s2"];
    const acIds = ["ac1", "ac2"];

    vi.mocked(db.pack.findFirst).mockResolvedValue({
      id: packId,
      project: {
        workspace: {
          healthWeights: {
            sourceDrift: 0.3,
            evidenceCoverage: 0.25,
            qaPassRate: 0.2,
            deliveryFeedback: 0.15,
            sourceAge: 0.1,
          },
        },
      },
      versions: [
        {
          id: versionId,
          versionNumber: 1,
          sourceIds: [],
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          stories: storyIds.map((id) => ({ id })),
        },
      ],
    } as never);

    vi.mocked(db.sourceChunkDiff.count).mockResolvedValue(0);
    vi.mocked(db.acceptanceCriteria.findMany).mockResolvedValue(
      acIds.map((id, i) => ({ id, storyId: storyIds[i]! })) as never
    );
    vi.mocked(db.evidenceLink.findMany).mockResolvedValue(
      acIds.map((id) => ({ entityId: id })) as never
    );
    vi.mocked(db.qAFlag.findMany).mockResolvedValue([]);
    vi.mocked(db.deliveryFeedback.count).mockResolvedValue(0);
    vi.mocked(db.source.findMany).mockResolvedValue([
      { updatedAt: new Date() },
    ] as never);

    const result = await computePackHealth(packId);
    expect(result.score).toBe(100);
    expect(result.status).toBe("healthy");
    expect(result.factors.sourceDrift).toBe(100);
    expect(result.factors.evidenceCoverage).toBe(100);
    expect(result.factors.qaPassRate).toBe(100);
    expect(result.factors.deliveryFeedback).toBe(100);
    expect(result.factors.sourceAge).toBe(100);
  });

  it("returns 0 when source drift is maxed out", async () => {
    const packId = "pack2";
    vi.mocked(db.pack.findFirst).mockResolvedValue({
      id: packId,
      project: {
        workspace: {
          healthWeights: {
            sourceDrift: 1,
            evidenceCoverage: 0,
            qaPassRate: 0,
            deliveryFeedback: 0,
            sourceAge: 0,
          },
        },
      },
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          sourceIds: ["s1"],
          createdAt: new Date(0),
          stories: [],
        },
      ],
    } as never);

    vi.mocked(db.sourceChunkDiff.count).mockResolvedValue(25);
    vi.mocked(db.acceptanceCriteria.findMany).mockResolvedValue([]);
    vi.mocked(db.evidenceLink.findMany).mockResolvedValue([]);
    vi.mocked(db.qAFlag.findMany).mockResolvedValue([]);
    vi.mocked(db.deliveryFeedback.count).mockResolvedValue(0);
    vi.mocked(db.source.findMany).mockResolvedValue([]);

    const result = await computePackHealth(packId);
    expect(result.factors.sourceDrift).toBe(0);
    expect(result.score).toBe(0);
  });

  it("respects custom health weights", async () => {
    const packId = "pack3";
    vi.mocked(db.pack.findFirst).mockResolvedValue({
      id: packId,
      project: {
        workspace: {
          healthWeights: {
            sourceDrift: 0.5,
            evidenceCoverage: 0.5,
            qaPassRate: 0,
            deliveryFeedback: 0,
            sourceAge: 0,
          },
        },
      },
      versions: [
        {
          id: "v1",
          versionNumber: 1,
          sourceIds: [],
          createdAt: new Date(),
          stories: [{ id: "s1" }],
        },
      ],
    } as never);

    vi.mocked(db.sourceChunkDiff.count).mockResolvedValue(0);
    vi.mocked(db.acceptanceCriteria.findMany).mockResolvedValue([
      { id: "ac1", storyId: "s1" },
    ] as never);
    vi.mocked(db.evidenceLink.findMany).mockResolvedValue([
      { entityId: "ac1" },
    ] as never);
    vi.mocked(db.qAFlag.findMany).mockResolvedValue([]);
    vi.mocked(db.deliveryFeedback.count).mockResolvedValue(0);
    vi.mocked(db.source.findMany).mockResolvedValue([]);

    const result = await computePackHealth(packId);
    expect(result.factors.sourceDrift).toBe(100);
    expect(result.factors.evidenceCoverage).toBe(100);
    expect(result.score).toBe(100);
  });
});
