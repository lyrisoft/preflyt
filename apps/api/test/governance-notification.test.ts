import { afterEach, expect, it, vi } from "vitest";
import {
  recordReadinessNotification,
  recordRulesetNotification,
  isGovernanceNotification,
} from "../src/notifications/notification-event.js";
import { deliverNotification } from "../src/notifications/notification-delivery.js";
const repo = { id: "repo", githubId: 501n, fullName: "fixture/app" };
afterEach(() => vi.unstubAllEnvs());
it("emits no new events when disabled or when readiness passes", async () => {
  const tx = { notificationEvent: { createMany: vi.fn() } };
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  await recordReadinessNotification(
    tx as any,
    repo,
    "org",
    "actor",
    7,
    "a".repeat(40),
    "policy",
    "BLOCK",
  );
  await recordRulesetNotification(
    tx as any,
    repo,
    "org",
    "actor",
    "deploy",
    "ACTIVE",
    "hash",
  );
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  await recordReadinessNotification(
    tx as any,
    repo,
    "org",
    "actor",
    7,
    "a".repeat(40),
    "policy",
    "PASS",
  );
  expect(tx.notificationEvent.createMany).not.toHaveBeenCalled();
});
it("gives governance updates only to current policy readers with repository scope", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "false");
  const write = vi.fn();
  const tx = {
    notificationEvent: {
      findUnique: async () => ({
        id: "event",
        type: "RULESET_DRIFTED",
        organizationId: "org",
        repositoryId: "repo",
        repositoryGithubId: "501",
      }),
      updateMany: async () => ({ count: 1 }),
      update: vi.fn(),
    },
    gitHubRepository: { findFirst: async () => repo },
    contributorObservation: { findMany: async () => [] },
    organizationMembership: {
      findMany: async () => [
        { identityId: "owner", role: "OWNER", grants: [] },
        {
          identityId: "scoped",
          role: "POLICY_MANAGER",
          grants: [{ repositoryId: "repo" }],
        },
        { identityId: "unscoped", role: "POLICY_MANAGER", grants: [] },
        {
          identityId: "dev",
          role: "DEVELOPER",
          grants: [{ repositoryId: "repo" }],
        },
      ],
    },
    notificationPreference: {
      findMany: async () => [{ identityId: "scoped", assessments: false }],
    },
    inboxNotification: { createMany: write },
    auditEvent: { create: vi.fn() },
  };
  const db = { $transaction: (work: any) => work(tx) };
  await deliverNotification(db as any, "event");
  expect(
    write.mock.calls[0][0].data.map((r: any) => r.identityId).sort(),
  ).toEqual(["owner", "scoped"]);
  expect(isGovernanceNotification("READINESS_INCOMPLETE")).toBe(false);
  expect(isGovernanceNotification("RULESET_DRIFTED")).toBe(true);
});
