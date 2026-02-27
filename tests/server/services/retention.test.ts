import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  applyRetentionPolicy,
  softDeleteProject,
  recoverProject,
  redactEvidence,
  exportAllProjectData,
} from "@/server/services/retention";
import { db } from "@/server/db";

vi.mock("@/server/db", () => ({
  db: {
    workspace: {
      findFirst: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sourceChunk: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    baseline: {
      findMany: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

describe("retention service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyRetentionPolicy returns 0 when retention disabled", async () => {
    vi.mocked(db.workspace.findFirst).mockResolvedValue(null);
    const count = await applyRetentionPolicy("ws1");
    expect(count).toBe(0);
  });

  it("applyRetentionPolicy archives inactive projects", async () => {
    vi.mocked(db.workspace.findFirst).mockResolvedValue({
      id: "ws1",
      retentionEnabled: true,
      retentionAutoArchiveDays: 180,
      retentionAutoDeleteDays: 365,
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "p1", workspaceId: "ws1" },
    ] as never[]);
    vi.mocked(db.project.update).mockResolvedValue({} as never);

    const count = await applyRetentionPolicy("ws1");
    expect(count).toBe(1);
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("softDeleteProject sets deletedAt and archivedAt", async () => {
    vi.mocked(db.project.update).mockResolvedValue({} as never);
    await softDeleteProject("p1");
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { deletedAt: expect.any(Date), archivedAt: expect.any(Date) },
    });
  });

  it("recoverProject returns false when not deleted", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValue({ deletedAt: null } as never);
    const ok = await recoverProject("p1");
    expect(ok).toBe(false);
  });

  it("recoverProject returns false when recovery window expired", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    vi.mocked(db.project.findFirst).mockResolvedValue({
      deletedAt: oldDate,
    } as never);
    const ok = await recoverProject("p1");
    expect(ok).toBe(false);
  });

  it("recoverProject clears deletedAt within window", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    vi.mocked(db.project.findFirst).mockResolvedValue({
      deletedAt: recentDate,
    } as never);
    vi.mocked(db.project.update).mockResolvedValue({} as never);
    const ok = await recoverProject("p1");
    expect(ok).toBe(true);
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { deletedAt: null, archivedAt: null },
    });
  });

  it("redactEvidence replaces content and sets redactedAt", async () => {
    vi.mocked(db.sourceChunk.update).mockResolvedValue({} as never);
    await redactEvidence("chunk1", "user1");
    expect(db.sourceChunk.update).toHaveBeenCalledWith({
      where: { id: "chunk1" },
      data: {
        content: "[REDACTED]",
        redactedAt: expect.any(Date),
        redactedBy: "user1",
      },
    });
  });

  it("exportAllProjectData throws when project not found", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValue(null);
    await expect(
      exportAllProjectData("p1", "ws1")
    ).rejects.toThrow("Project not found");
  });

  it("exportAllProjectData returns ZIP buffer with manifest", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValue({
      id: "p1",
      name: "Test",
      sources: [],
      packs: [],
    } as never);
    vi.mocked(db.sourceChunk.findMany).mockResolvedValue([]);
    vi.mocked(db.baseline.findMany).mockResolvedValue([]);
    vi.mocked(db.auditLog.findMany).mockResolvedValue([]);

    const buffer = await exportAllProjectData("p1", "ws1");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
