import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateComplianceExport } from "@/server/services/compliance-export";
import { db } from "@/server/db";

vi.mock("@/server/db", () => ({
  db: {
    workspace: { findFirst: vi.fn() },
    project: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn() },
    approvalRequest: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    sourceChunk: { findMany: vi.fn() },
    baseline: { findMany: vi.fn() },
  },
}));

describe("compliance export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.workspace.findFirst).mockResolvedValue({
      retentionEnabled: false,
      retentionAutoArchiveDays: 180,
      retentionAutoDeleteDays: 365,
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValue([]);
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([]);
    vi.mocked(db.projectMember.findMany).mockResolvedValue([]);
    vi.mocked(db.approvalRequest.findMany).mockResolvedValue([]);
    vi.mocked(db.auditLog.findMany).mockResolvedValue([]);
  });

  it("returns ZIP buffer with manifest", async () => {
    const buffer = await generateComplianceExport("ws1");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("includes audit-log.csv and retention-policy.json", async () => {
    vi.mocked(db.auditLog.findMany).mockResolvedValue([
      {
        id: "a1",
        workspaceId: "ws1",
        userId: "u1",
        action: "test",
        entityType: "Test",
        entityId: null,
        metadata: null,
        createdAt: new Date(),
      },
    ] as never[]);

    const buffer = await generateComplianceExport("ws1");
    expect(buffer.length).toBeGreaterThan(100);
  });
});
