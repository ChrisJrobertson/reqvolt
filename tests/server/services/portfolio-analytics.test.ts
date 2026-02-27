import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPortfolioMetrics } from "@/server/services/portfolio-analytics";
import { db } from "@/server/db";

vi.mock("@/server/db", () => ({
  db: {
    project: { findMany: vi.fn() },
    pack: { findMany: vi.fn() },
    evidenceLink: { findMany: vi.fn() },
    approvalRequest: { findMany: vi.fn() },
    changeRequest: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    qAFlag: { findMany: vi.fn() },
    storyExport: { findMany: vi.fn() },
    evidenceConflict: { findMany: vi.fn() },
    source: { findMany: vi.fn(), findFirst: vi.fn() },
    packVersion: { findFirst: vi.fn() },
    baseline: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

describe("portfolio analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "p1", name: "Project 1" },
    ] as never[]);
    vi.mocked(db.pack.findMany).mockResolvedValue([]);
    vi.mocked(db.evidenceLink.findMany).mockResolvedValue([]);
    vi.mocked(db.approvalRequest.findMany).mockResolvedValue([]);
    vi.mocked(db.baseline.findMany).mockResolvedValue([]);
    vi.mocked(db.changeRequest.findMany).mockResolvedValue([]);
    vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
    vi.mocked(db.qAFlag.findMany).mockResolvedValue([]);
    vi.mocked(db.storyExport.findMany).mockResolvedValue([]);
    vi.mocked(db.evidenceConflict.findMany).mockResolvedValue([]);
    vi.mocked(db.source.findMany).mockResolvedValue([]);
    vi.mocked(db.source.findFirst).mockResolvedValue(null);
    vi.mocked(db.packVersion.findFirst).mockResolvedValue(null);
    vi.mocked(db.baseline.findFirst).mockResolvedValue(null);
  });

  it("returns metrics structure", async () => {
    const metrics = await getPortfolioMetrics("ws1");
    expect(metrics).toHaveProperty("coverage");
    expect(metrics).toHaveProperty("volatility");
    expect(metrics).toHaveProperty("cycleTime");
    expect(metrics).toHaveProperty("quality");
    expect(metrics).toHaveProperty("riskSignals");
    expect(metrics.coverage.averageEvidenceCoverage).toBe(0);
    expect(metrics.quality.qaPassRate).toBe(100);
  });

  it("computes evidence coverage from packs and links", async () => {
    vi.mocked(db.pack.findMany).mockResolvedValue([
      {
        id: "pack1",
        projectId: "p1",
        project: { id: "p1", name: "P1" },
        versions: [
          {
            stories: [
              { id: "s1" },
              { id: "s2" },
            ],
          },
        ],
      },
    ] as never[]);
    vi.mocked(db.evidenceLink.findMany).mockResolvedValue([
      { entityId: "s1" },
    ] as never[]);

    const metrics = await getPortfolioMetrics("ws1");
    expect(metrics.coverage.averageEvidenceCoverage).toBe(50);
  });
});
