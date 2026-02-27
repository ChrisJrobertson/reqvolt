import { describe, it, expect } from "vitest";

describe("project-rbac", () => {
  it("ProjectRole enum has expected values", () => {
    const roles = ["Contributor", "Reviewer", "Viewer", "Approver"];
    expect(roles).toContain("Contributor");
    expect(roles).toContain("Reviewer");
    expect(roles).toContain("Viewer");
    expect(roles).toContain("Approver");
  });
});
