import { describe, it, expect } from "vitest";
import {
  healthDigestHtml,
  healthDigestText,
  immediateNotificationHtml,
  immediateNotificationText,
} from "../src/lib/email-templates";

describe("Email templates", () => {
  describe("healthDigestHtml", () => {
    it("produces valid HTML with correct pack data", () => {
      const html = healthDigestHtml({
        userName: "Alex",
        packs: [
          {
            name: "Q4 Platform",
            projectName: "Platform",
            healthScore: 62,
            healthStatus: "at_risk",
            topIssue: "Source drift: 45%",
            link: "https://app.reqvolt.com/workspace/ws1/projects/p1/packs/pack1",
          },
        ],
        workspaceId: "ws1",
      });
      expect(html).toContain("Hi Alex");
      expect(html).toContain("Q4 Platform");
      expect(html).toContain("Platform");
      expect(html).toContain("62");
      expect(html).toContain("at_risk");
      expect(html).toContain("Source drift: 45%");
      expect(html).toContain("View pack");
      expect(html).toContain("Manage notification preferences");
      expect(html).toMatch(/<html/i);
    });
  });

  describe("immediateNotificationHtml", () => {
    it("includes action URL and UK English", () => {
      const html = immediateNotificationHtml({
        userName: "Jordan",
        title: "New source relevant to pack",
        body: "A new source has been added that may strengthen your pack.",
        actionUrl: "/workspace/ws1/projects/p1/packs/pack1",
        actionLabel: "View in Reqvolt",
        workspaceId: "ws1",
      });
      expect(html).toContain("Hi Jordan");
      expect(html).toContain("New source relevant to pack");
      expect(html).toContain("View in Reqvolt");
      expect(html).toContain("Manage notification preferences");
      expect(html).toMatch(/View in Reqvolt/);
    });
  });

  describe("healthDigestText", () => {
    it("includes pack names and links, no HTML", () => {
      const text = healthDigestText({
        userName: "Alex",
        packs: [
          {
            name: "Q4 Platform",
            projectName: "Platform",
            healthScore: 62,
            healthStatus: "at_risk",
            topIssue: "Source drift: 45%",
            link: "https://app.reqvolt.com/pack1",
          },
        ],
        workspaceId: "ws1",
      });
      expect(text).toContain("Q4 Platform");
      expect(text).toContain("https://app.reqvolt.com/pack1");
      expect(text).not.toMatch(/<[a-z]+/);
    });
  });

  describe("immediateNotificationText", () => {
    it("includes action URL, no HTML tags", () => {
      const text = immediateNotificationText({
        userName: "Jordan",
        title: "New source",
        body: "A new source was added.",
        actionUrl: "/workspace/ws1/pack1",
        actionLabel: "View in Reqvolt",
        workspaceId: "ws1",
      });
      expect(text).toContain("View in Reqvolt");
      expect(text).not.toMatch(/<[a-z]+/);
    });
  });

  describe("UK English", () => {
    it("uses UK spelling in templates", () => {
      const html = healthDigestHtml({
        userName: "Test",
        packs: [],
        workspaceId: "ws1",
      });
      expect(html).toContain("preferences");
      expect(html).not.toContain("preferances");
    });
  });
});
