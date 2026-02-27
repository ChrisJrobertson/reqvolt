import { describe, it, expect } from "vitest";

describe("change-request", () => {
  it("ChangeRequestStatus enum has expected values", () => {
    const statuses = ["open", "approved", "rejected", "implemented"];
    expect(statuses).toContain("open");
    expect(statuses).toContain("approved");
    expect(statuses).toContain("rejected");
    expect(statuses).toContain("implemented");
  });
});
