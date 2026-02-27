import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLegalHold, assertNoLegalHoldForSource } from "@/server/lib/legal-hold";
import { db } from "@/server/db";
import { TRPCError } from "@trpc/server";

vi.mock("@/server/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    source: { findFirst: vi.fn() },
  },
}));

describe("legal hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when project has no legal hold", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValue({ legalHold: false } as never);
    await expect(assertNoLegalHold("p1")).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN when project has legal hold", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValue({ legalHold: true } as never);
    await expect(assertNoLegalHold("p1")).rejects.toThrow(TRPCError);
    await expect(assertNoLegalHold("p1")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("legal hold"),
    });
  });

  it("assertNoLegalHoldForSource checks project via source", async () => {
    vi.mocked(db.source.findFirst).mockResolvedValue({ projectId: "p1" } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ legalHold: true } as never);
    await expect(assertNoLegalHoldForSource("s1")).rejects.toThrow(TRPCError);
  });
});
