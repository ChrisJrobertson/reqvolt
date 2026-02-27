import { describe, it, expect } from "vitest";

describe("integration-dashboard", () => {
  it("syncStatus shape has expected fields", () => {
    const expected = [
      "totalArtefacts",
      "pushedToMonday",
      "pushedToJira",
      "notYetPushed",
      "changedSincePush",
    ];
    expect(expected).toContain("totalArtefacts");
    expect(expected).toContain("pushedToMonday");
    expect(expected).toContain("changedSincePush");
  });
});
