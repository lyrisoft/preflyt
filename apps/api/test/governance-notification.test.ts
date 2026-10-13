import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from "vitest";
import {
  recordAssessmentNotification,
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

it('alerts only on scoped unsuppressed critical report findings, without changing assessment evidence', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const write = vi.fn()
  const result = { ruleId: 'unsafe', message: { text: 'Unsafe input' }, properties: { 'security-severity': '9.5' } }
  const report = (suppressed = false) => JSON.stringify({ version: '2.1.0', runs: [{ tool: { driver: { name: 'fixture', version: '1.0' } }, results: [{ ...result, ...(suppressed ? { suppressions: [{ kind: 'inSource', status: 'accepted' }] } : {}) }] }] })
  const bytes = Buffer.from(report()), sha = createHash('sha256').update(bytes).digest('hex')
  let artifacts = [{ id: 'artifact', format: 'sarif', content: bytes, sha256: sha, deliveryId: 'delivery' }]
  const tx = { gitHubInstallation: { findUniqueOrThrow: async () => ({ organizationId: 'org' }) }, ciArtifactImport: { findMany: vi.fn(async () => artifacts) }, notificationEvent: { create: write } }
  const assessment = { id: 'assessment', sourceSha: 'a'.repeat(40), report: { observations: [{ deliveryId: 'delivery', artifacts: [{ id: 'artifact', sha256: sha }] }] } }
  await recordAssessmentNotification(tx as any, assessment, { ...repo, installationId: 1n }, 'actor')
  expect(write.mock.calls[0][0].data).toMatchObject({ type: 'CRITICAL_FINDINGS_REPORTED', severity: 'error', assessmentId: 'assessment' })
  expect(tx.ciArtifactImport.findMany.mock.calls[0][0].where.evidence).toMatchObject({ repositoryGithubId: 501n, installationId: 1n, sourceSha: assessment.sourceSha })
  write.mockClear()
  artifacts = [{ ...artifacts[0], deliveryId: 'wrong-delivery' }]
  await recordAssessmentNotification(tx as any, assessment, { ...repo, installationId: 1n }, 'actor')
  expect(write.mock.calls[0][0].data.type).toBe('ASSESSMENT_COMPLETED')
  write.mockClear()
  const suppressed = Buffer.from(report(true)), suppressedSha = createHash('sha256').update(suppressed).digest('hex')
  artifacts = [{ ...artifacts[0], deliveryId: 'delivery', content: suppressed, sha256: suppressedSha }]
  await recordAssessmentNotification(tx as any, { ...assessment, report: { observations: [{ deliveryId: 'delivery', artifacts: [{ id: 'artifact', sha256: suppressedSha }] }] } }, { ...repo, installationId: 1n }, 'actor')
  expect(write.mock.calls[0][0].data.type).toBe('ASSESSMENT_COMPLETED')
})
