import "reflect-metadata";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { disposableDatabase } from "./disposable-database.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import type { AuthenticatedSession } from "../src/auth/session.guard.js";
import {
  weeklyHealthPreferences,
  saveWeeklyHealthPreferences,
} from "../src/notifications/weekly-health-preferences.js";
import {
  dispatchWeeklyHealthDigests,
  deliverWeeklyHealthDigest,
} from "../src/notifications/weekly-health-delivery.js";
import {
  weeklyHealthRepository,
  weeklyHealthTemplate,
} from "../src/notifications/weekly-health-report.js";
import { weeklyHealthPeriod } from "../src/notifications/weekly-health-schedule.js";
import type { HealthReport } from "../src/health/health-report.js";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let auth: AuthorizationService;
const session: AuthenticatedSession = {
  authenticated: true,
  identityId: "member",
  organizationId: "org",
  subject: "member",
  role: "DEVELOPER",
  email: null,
};
const now = new Date("2026-10-21T12:00:00Z"),
  cutoff = new Date("2026-10-19T09:00:00Z"),
  start = new Date("2026-10-12T09:00:00Z");
const settings = {
  enabled: true,
  repositoryIds: ["1234"],
  day: 1,
  hour: 9,
  timezone: "UTC",
};
const queue = { add: vi.fn(async () => ({})), getJob: vi.fn(async () => null) };
const mail = { sendWeeklyHealth: vi.fn(async () => {}) };
function report(
  ids: string[],
  patch: Partial<HealthReport> = {},
): HealthReport {
  return {
    version: 1,
    mode: "EXECUTED",
    completeness: "COMPLETE",
    comparisonKey: "rules-v1",
    inspection: { complete: true, fileCount: 2, languages: ["TypeScript"] },
    limits: [],
    analyses: [
      {
        id: "security.sast",
        title: "Security",
        state: ids.length ? "FAIL" : "PASS",
        reason: "RECORDED",
        reportHash: "a".repeat(64),
        tool: "fixture-v1",
        configHash: "b".repeat(64),
        findingsRetained: ids.length,
        findingsReported: ids.length,
      },
    ],
    findings: ids.map((fingerprint) => ({
      fingerprint,
      category: "security",
      checkId: "security.sast",
      evidence: "ANALYZER_REPORTED",
      severity: "high",
      title: "Potential issue",
      path: "app.ts",
      line: 1,
      ruleId: "fixture",
      suppressed: false,
    })),
    ...patch,
  };
}
async function assessment(
  id: string,
  at: string,
  value: HealthReport,
  state = "COMPLETED",
  branch = "main",
) {
  return fixture.prisma.repositoryHealthAssessment.create({
    data: {
      id,
      organizationId: "org",
      repositoryId: "repo",
      branch,
      targetRevision: 1,
      requestKey: id,
      actorId: "member",
      state,
      sourceSha: "a".repeat(40),
      finishedAt: new Date(at),
      createdAt: new Date(at),
      report: value as object,
    },
  });
}
async function delivery() {
  return fixture.prisma.weeklyHealthDigestDelivery.create({
    data: {
      identityId: "member",
      organizationId: "org",
      week: "2026-10-19",
      periodStart: start,
      cutoff,
      repositoryIds: ["1234"],
      nextAttemptAt: now,
    },
  });
}
beforeAll(async () => {
  fixture = await disposableDatabase("weeklydigest");
  auth = new AuthorizationService(fixture.prisma);
});
afterAll(async () => {
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  // Keep expiry and retry checks independent of the machine's calendar date.
  // Leave real timers running for PostgreSQL and SMTP I/O.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  queue.add.mockClear();
  mail.sendWeeklyHealth.mockClear();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "true");
  vi.stubEnv("SMTP_FROM", "preflyt@example.com");
  vi.stubEnv("SMTP_HOST", "localhost");
  vi.stubEnv("QUEUE_REDIS_URL", "redis://localhost:6379");
  await fixture.reset();
  const db = fixture.prisma;
  await db.organization.create({ data: { id: "org", name: "Org" } });
  await db.identity.create({
    data: {
      id: "member",
      issuer: "fixture",
      subject: "member",
      email: "member@example.com",
    },
  });
  await db.organizationMembership.create({
    data: {
      id: "membership",
      identityId: "member",
      organizationId: "org",
      role: "DEVELOPER",
    },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 123n,
      organizationId: "org",
      accountLogin: "org",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
      connectedById: "member",
    },
  });
  await db.gitHubRepository.create({
    data: {
      id: "repo",
      githubId: 1234n,
      installationId: 123n,
      name: "repo",
      fullName: "org/repo",
      ownerLogin: "org",
      defaultBranch: "main",
      isPrivate: true,
      selected: true,
    },
  });
  await db.repositoryGrant.create({
    data: { membershipId: "membership", repositoryId: "repo" },
  });
  await db.notificationPreference.create({
    data: {
      identityId: "member",
      organizationId: "org",
      weeklyHealthEnabled: true,
      weeklyHealthEnabledAt: new Date("2026-10-01"),
      weeklyHealthRepositoryIds: ["1234"],
    },
  });
});
afterEach(() => vi.useRealTimers());
it("saves independent opt-in, validated schedule and authorized selection", async () => {
  const saved = await saveWeeklyHealthPreferences(
    fixture.prisma,
    auth,
    session,
    settings,
  );
  expect(saved.enabled).toBe(true);
  expect(saved.repositoryIds).toEqual(["1234"]);
  expect(saved.suggestedRepositoryIds).toEqual(["1234"]);
  expect(
    (await fixture.prisma.notificationPreference.findFirstOrThrow()).email,
  ).toBe(false);
  await expect(
    saveWeeklyHealthPreferences(fixture.prisma, auth, session, {
      ...settings,
      repositoryIds: ["9999"],
    }),
  ).rejects.toBeInstanceOf(ForbiddenException);
  await expect(
    saveWeeklyHealthPreferences(fixture.prisma, auth, session, {
      ...settings,
      timezone: "bad/zone",
    }),
  ).rejects.toThrow("timezone");
  await expect(
    saveWeeklyHealthPreferences(fixture.prisma, auth, session, {
      ...settings,
      repositoryIds: [],
    }),
  ).rejects.toThrow("repositories");
  await fixture.prisma.repositoryGrant.deleteMany();
  expect(
    (await weeklyHealthPreferences(fixture.prisma, auth, session))
      .repositoryIds,
  ).toEqual([]);
});
it("requires email and active membership; disabling remains possible when SMTP is unavailable", async () => {
  await fixture.prisma.identity.update({
    where: { id: "member" },
    data: { email: null },
  });
  await expect(
    saveWeeklyHealthPreferences(fixture.prisma, auth, session, settings),
  ).rejects.toThrow("verify");
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "false");
  expect(
    (
      await saveWeeklyHealthPreferences(fixture.prisma, auth, session, {
        ...settings,
        enabled: false,
        repositoryIds: [],
      })
    ).enabled,
  ).toBe(false);
  await fixture.prisma.organizationMembership.update({
    where: { id: "membership" },
    data: { active: false },
  });
  await expect(
    weeklyHealthPreferences(fixture.prisma, auth, session),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
it("deduplicates concurrent scheduling and never sends a retrospective email for a new opt-in", async () => {
  await Promise.all([
    dispatchWeeklyHealthDigests(fixture.prisma, queue as never, now),
    dispatchWeeklyHealthDigests(fixture.prisma, queue as never, now),
  ]);
  expect(await fixture.prisma.weeklyHealthDigestDelivery.count()).toBe(1);
  await fixture.prisma.weeklyHealthDigestDelivery.deleteMany();
  await fixture.prisma.notificationPreference.updateMany({
    data: { weeklyHealthEnabledAt: now },
  });
  await dispatchWeeklyHealthDigests(fixture.prisma, queue as never, now);
  expect(await fixture.prisma.weeklyHealthDigestDelivery.count()).toBe(0);
});
it("compares complete identity sets across partial scans and uses the selected branch", async () => {
  await assessment("baseline", "2026-10-11T12:00:00Z", report(["one", "two"]));
  await assessment(
    "partial",
    "2026-10-13T12:00:00Z",
    report([], { completeness: "PARTIAL" }),
  );
  await assessment(
    "complete",
    "2026-10-18T12:00:00Z",
    report(["two", "three"]),
  );
  await assessment(
    "other-branch",
    "2026-10-18T13:00:00Z",
    report([]),
    "COMPLETED",
    "develop",
  );
  const repo = await fixture.prisma.gitHubRepository.findUniqueOrThrow({
    where: { id: "repo" },
  });
  const result = await weeklyHealthRepository(
    fixture.prisma,
    "org",
    repo,
    start,
    cutoff,
  );
  expect(result.changes).toEqual([
    { category: "security", introduced: 1, noLongerReported: 1, remaining: 2 },
  ]);
  expect(result.severities.high).toBe(2);
  await assessment(
    "latest-partial",
    "2026-10-19T08:00:00Z",
    report([], { completeness: "PARTIAL" }),
  );
  const partial = await weeklyHealthRepository(
    fixture.prisma,
    "org",
    repo,
    start,
    cutoff,
  );
  expect(partial.incomplete).toBe(true);
  expect(partial.changes).toEqual([]);
});
it("never credits changed scope, failed scans, AI results or missing/newly absent assessments as fixes", async () => {
  const repo = await fixture.prisma.gitHubRepository.findUniqueOrThrow({
    where: { id: "repo" },
  });
  expect(
    (await weeklyHealthRepository(fixture.prisma, "org", repo, start, cutoff))
      .status,
  ).toBe("NOT_ASSESSED");
  await assessment("baseline", "2026-10-11T12:00:00Z", report(["one"]));
  expect(
    (await weeklyHealthRepository(fixture.prisma, "org", repo, start, cutoff))
      .noNewAssessment,
  ).toBe(true);
  await assessment(
    "changed",
    "2026-10-18T12:00:00Z",
    report([], { comparisonKey: "new-scope" }),
  );
  expect(
    (await weeklyHealthRepository(fixture.prisma, "org", repo, start, cutoff))
      .changes,
  ).toEqual([]);
  await assessment("failed", "2026-10-19T08:00:00Z", report([]), "FAILED");
  expect(
    (await weeklyHealthRepository(fixture.prisma, "org", repo, start, cutoff))
      .changes,
  ).toEqual([]);
});
it("sends once under concurrent delivery and excludes source code from the email", async () => {
  await assessment("latest", "2026-10-18T12:00:00Z", report(["one"]));
  const row = await delivery();
  await Promise.all([
    deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id),
    deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id),
  ]);
  expect(mail.sendWeeklyHealth).toHaveBeenCalledTimes(1);
  expect(
    (
      await fixture.prisma.weeklyHealthDigestDelivery.findUniqueOrThrow({
        where: { id: row.id },
      })
    ).state,
  ).toBe("SENT");
  const text = weeklyHealthTemplate(
    "https://preflyt.example",
    row.week,
    mail.sendWeeklyHealth.mock.calls[0]![3],
  ).text;
  expect(text).toContain("org/repo");
  expect(text).not.toContain("app.ts");
  expect(text).not.toContain("Potential issue");
});
it.each(["grant", "membership", "selection", "email", "unsubscribe"])(
  "rechecks %s before delivery",
  async (revoked) => {
    const db = fixture.prisma,
      row = await delivery();
    if (revoked === "grant") await db.repositoryGrant.deleteMany();
    if (revoked === "membership")
      await db.organizationMembership.updateMany({ data: { active: false } });
    if (revoked === "selection")
      await db.notificationPreference.updateMany({
        data: { weeklyHealthRepositoryIds: [] },
      });
    if (revoked === "email")
      await db.identity.updateMany({ data: { email: null } });
    if (revoked === "unsubscribe")
      await db.notificationPreference.updateMany({
        data: { weeklyHealthEnabled: false },
      });
    await deliverWeeklyHealthDigest(db, auth, mail, row.id);
    expect(mail.sendWeeklyHealth).not.toHaveBeenCalled();
    expect(
      (
        await db.weeklyHealthDigestDelivery.findUniqueOrThrow({
          where: { id: row.id },
        })
      ).state,
    ).toBe("SKIPPED");
  },
);
it("checks fresh access again after report generation", async () => {
  const row = await delivery(),
    original = auth.requireRepository.bind(auth);
  const freshMembership = vi.spyOn(auth, 'requireOrganization');
  let calls = 0;
  vi.spyOn(auth, "requireRepository").mockImplementation(async (...args) => {
    expect(args[4]).toBe(false);
    if (++calls === 2) throw new ForbiddenException();
    return original(...args);
  });
  await deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id);
  expect(calls).toBe(2);
  expect(freshMembership).toHaveBeenCalledWith(expect.anything(), 'assessment.read', true);
  expect(mail.sendWeeklyHealth).not.toHaveBeenCalled();
});
it("retries SMTP failures durably without duplicating the weekly delivery", async () => {
  const row = await delivery();
  const failureMail = {
    sendWeeklyHealth: vi.fn(async () => {
      throw new Error("SMTP unavailable");
    }),
  };
  await deliverWeeklyHealthDigest(fixture.prisma, auth, failureMail, row.id);
  const result =
    await fixture.prisma.weeklyHealthDigestDelivery.findUniqueOrThrow({
      where: { id: row.id },
    });
  expect(result.state).toBe("PENDING");
  expect(result.attempts).toBe(1);
  expect(result.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
});
it("escapes repository names and never treats missing data as healthy", () => {
  const result = weeklyHealthTemplate("https://example.com", "2026-10-19", [
    {
      githubId: "1234",
      name: "<img src=x>",
      branch: "main",
      assessmentId: null,
      assessedAt: null,
      sourceSha: null,
      status: "NOT_ASSESSED",
      incomplete: true,
      noNewAssessment: true,
      severities: {},
      changes: [],
    },
  ]);
  expect(result.html).not.toContain("<img src=x>");
  expect(result.html).toContain("&lt;img src=x&gt;");
  expect(result.text).toContain("No saved assessment");
});
it("uses local calendar weeks across DST and timezone offsets", () => {
  expect(
    weeklyHealthPeriod(
      new Date("2026-10-19T08:30:00Z"),
      1,
      9,
      "Africa/Lagos",
    ).cutoff.toISOString(),
  ).toBe("2026-10-19T08:00:00.000Z");
  const before = weeklyHealthPeriod(
    new Date("2026-03-09T14:00:00Z"),
    1,
    9,
    "America/New_York",
  );
  expect(before.cutoff.toISOString()).toBe("2026-03-09T13:00:00.000Z");
  expect(before.periodStart.toISOString()).toBe("2026-03-02T14:00:00.000Z");
  expect(
    weeklyHealthPeriod(new Date("2026-10-19T07:00:00Z"), 1, 9, "Africa/Lagos")
      .week,
  ).toBe("2026-10-12");
});

it("rechecks changes to preferences made while the report is being prepared", async () => {
  const row = await delivery(),
    original = auth.requireRepository.bind(auth);
  let calls = 0;
  vi.spyOn(auth, "requireRepository").mockImplementation(async (...args) => {
    if (++calls === 2)
      await fixture.prisma.notificationPreference.updateMany({
        data: { weeklyHealthEnabled: false },
      });
    return original(...args);
  });
  await deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id);
  expect(mail.sendWeeklyHealth).not.toHaveBeenCalled();
  expect(
    (
      await fixture.prisma.weeklyHealthDigestDelivery.findUniqueOrThrow({
        where: { id: row.id },
      })
    ).failureCode,
  ).toBe("RECIPIENT_CHANGED");
});
it("omits a revoked repository while still delivering authorized repositories", async () => {
  await fixture.prisma.gitHubRepository.create({
    data: {
      id: "other",
      githubId: 5678n,
      installationId: 123n,
      name: "other",
      fullName: "org/private",
      ownerLogin: "org",
      defaultBranch: "main",
      isPrivate: true,
      selected: true,
    },
  });
  await fixture.prisma.notificationPreference.updateMany({
    data: { weeklyHealthRepositoryIds: ["1234", "5678"] },
  });
  const row = await delivery();
  await fixture.prisma.weeklyHealthDigestDelivery.update({
    where: { id: row.id },
    data: { repositoryIds: ["1234", "5678"] },
  });
  await deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id);
  expect(mail.sendWeeklyHealth).toHaveBeenCalledTimes(1);
  expect(
    mail.sendWeeklyHealth.mock.calls[0]![3].map((repo) => repo.name),
  ).toEqual(["org/repo"]);
});
it("never sends a stale queued digest from a previous reporting week", async () => {
  const row = await delivery();
  await fixture.prisma.weeklyHealthDigestDelivery.update({
    where: { id: row.id },
    data: { cutoff: new Date(Date.now() - 8 * 86400000) },
  });
  await deliverWeeklyHealthDigest(fixture.prisma, auth, mail, row.id);
  expect(mail.sendWeeklyHealth).not.toHaveBeenCalled();
  expect(
    (
      await fixture.prisma.weeklyHealthDigestDelivery.findUniqueOrThrow({
        where: { id: row.id },
      })
    ).failureCode,
  ).toBe("DIGEST_EXPIRED");
});

it("moves a scheduled skipped DST hour forward and deduplicates the repeated fall hour", () => {
  expect(
    weeklyHealthPeriod(
      new Date("2026-03-08T07:30:00Z"),
      0,
      2,
      "America/New_York",
    ).cutoff.toISOString(),
  ).toBe("2026-03-08T07:00:00.000Z");
  const first = weeklyHealthPeriod(
    new Date("2026-11-01T05:30:00Z"),
    0,
    1,
    "America/New_York",
  );
  const second = weeklyHealthPeriod(
    new Date("2026-11-01T06:30:00Z"),
    0,
    1,
    "America/New_York",
  );
  expect(second.week).toBe(first.week);
  expect(second.cutoff).toEqual(first.cutoff);
});

it("does not credit fixes from category-only scans presented with incomplete repository coverage", async () => {
  await assessment(
    "baseline",
    "2026-10-11T12:00:00Z",
    report(["one"], { selection: "security" }),
  );
  await assessment(
    "selected",
    "2026-10-18T12:00:00Z",
    report([], { selection: "security" }),
  );
  const repo = await fixture.prisma.gitHubRepository.findUniqueOrThrow({
    where: { id: "repo" },
  });
  const result = await weeklyHealthRepository(
    fixture.prisma,
    "org",
    repo,
    start,
    cutoff,
  );
  expect(result.incomplete).toBe(true);
  expect(result.changes).toEqual([]);
});
