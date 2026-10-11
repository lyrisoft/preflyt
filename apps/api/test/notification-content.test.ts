import { describe, expect, it } from "vitest";
import { notificationContent } from "../src/notifications/notification-content.js";
import { notificationEmailTemplate } from "../src/notifications/notification-email-template.js";

describe("informative notifications", () => {
  it("names failures and missing evidence without claiming checks passed", () => {
    const content = notificationContent("ASSESSMENT_FAILED", {
      checks: [
        {
          title: "Tests",
          required: true,
          providerResult: "FAILED",
          coverage: "CONFIGURATION_OBSERVED",
        },
        { title: "Secret scan", required: true, coverage: "MISSING" },
        { title: "Dependency scan", required: false, coverage: "UNVERIFIED" },
      ],
    });
    expect(content.details).toEqual([
      "3 checks recorded · 2 required",
      "Reported failures: Tests",
      "Missing or unusable evidence: Secret scan",
    ]);
    expect(content.actionLabel).toBe("Review failed checks");
  });
  it("does not call a completed native check missing based on its configuration coverage", () => {
    const content = notificationContent("ASSESSMENT_COMPLETED", {
      checks: [
        {
          title: "Scan",
          required: true,
          evidenceSource: "NATIVE",
          nativeOutcome: "PASS",
          coverage: "MISSING",
        },
      ],
    });
    expect(content.details).toEqual(["1 check recorded · 1 required"]);
  });
  it("provides useful fallback copy for historical events without a saved report", () => {
    const content = notificationContent("ASSESSMENT_INCOMPLETE");
    expect(content.message).toContain(
      "Required checks could not be fully evaluated",
    );
    expect(content.details).toEqual([]);
  });
  it("identifies the published branch and revision", () => {
    expect(
      notificationContent("POLICY_PUBLISHED", undefined, {
        branchRef: "refs/heads/main",
        revision: 4,
      }).details,
    ).toEqual(["Branch: refs/heads/main · Policy revision 4"]);
  });
  it("makes email subjects specific while keeping repository details behind sign in", () => {
    const email = notificationEmailTemplate(
      "https://preflyt.example",
      "ORGANIZATION",
      "ASSESSMENT_INCOMPLETE",
    );
    expect(email.subject).toBe(
      "Preflyt: Assessment is missing required evidence",
    );
    expect(email.text).toContain(
      "Required checks could not be fully evaluated",
    );
    expect(email.text).toContain("https://preflyt.example/notifications");
    expect(email.text).toContain("Sign in to see the affected repository");
  });
  it("ignores unrecognized event types, including inherited object keys", () => {
    expect(
      notificationEmailTemplate(
        "https://preflyt.example",
        "PERSONAL",
        "__proto__",
      ).subject,
    ).toBe("New Preflyt notification");
    expect(notificationContent("__proto__").title).toBe("Repository update");
  });
  it("keeps test delivery wording separate from real event notifications", () => {
    expect(
      notificationEmailTemplate(
        "https://preflyt.example",
        "TEST",
        "ASSESSMENT_FAILED",
      ).subject,
    ).toBe("Preflyt email channel test");
  });
});
