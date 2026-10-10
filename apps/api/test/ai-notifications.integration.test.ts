import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { disposableDatabase } from './disposable-database.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { deliverNotification } from '../src/notifications/notification-delivery.js';
import { deliverNotificationEmail } from '../src/notifications/notification-email-delivery.js';
import { recordAiBudgetNotification, recordAiInferenceOutcome } from '../src/notifications/ai-notification.js';
import type { AuthenticatedSession } from '../src/auth/session.guard.js';
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, db: PrismaService;
const org = 'ai-notification-org';
const repo = { id: 'ai-alert-repo', githubId: 81818n, fullName: 'fixture/reviews' };
const provider = { id: 'ai-alert-provider', organizationId: org, revision: 1, enabled: true };
const session = (identityId = 'owner'): AuthenticatedSession => ({ authenticated: true, identityId, organizationId: org, subject: identityId, role: 'OWNER', email: null });
let assessmentId: string;
beforeAll(async () => { fixture = await disposableDatabase('ainotifications'); db = fixture.prisma; });
afterAll(async () => { await fixture?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await fixture.reset();
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true'); vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'false');
  await db.organization.create({ data: { id: org, name: 'AI fixture' } });
  for (const [identityId, role] of [['owner', 'OWNER'], ['admin', 'ADMIN'], ['lead', 'ENGINEERING_LEAD'], ['security', 'SECURITY_ENGINEER'], ['developer', 'DEVELOPER']] as const) {
    await db.identity.create({ data: { id: identityId, issuer: 'fixture', subject: identityId, email: `${identityId}@example.test` } });
    await db.organizationMembership.create({ data: { id: `member-${identityId}`, organizationId: org, identityId, role } });
  }
  await db.gitHubInstallation.create({ data: { id: 81817n, organizationId: org, connectedById: 'owner', accountLogin: 'fixture', accountType: 'Organization', repositorySelection: 'selected', permissions: {} } });
  await db.gitHubRepository.create({ data: { ...repo, installationId: 81817n, name: 'reviews', ownerLogin: 'fixture', selected: true, isPrivate: true } });
  for (const identityId of ['lead', 'security', 'developer', 'owner']) await db.repositoryGrant.create({ data: { membershipId: `member-${identityId}`, repositoryId: repo.id } });
  await db.aiProviderConnection.create({ data: { ...provider, name: 'Private provider name', endpointId: 'fixture', modelId: 'fixture-model', createdById: 'owner' } });
  assessmentId = (await db.commitAssessment.create({ data: { repositoryId: repo.id, sourceSha: 'a'.repeat(40), selectionId: 'fixture', requestKey: randomUUID(), inputHash: 'b'.repeat(64), assessmentHash: 'c'.repeat(64), request: {}, plan: {}, report: {} } })).id;
});
async function signal(outcome: 'transport_failed' | 'succeeded' = 'transport_failed') {
  const review = await db.aiSkillReview.create({ data: { organizationId: org, repositoryId: repo.id, assessmentId, actorId: 'owner', fingerprint: randomUUID(), stage: 'repository', snapshot: {}, reservedMicroCents: 1n, state: 'RUNNING' } });
  const input = { reviewId: review.id, organizationId: org, repositoryId: repo.id, actorId: 'owner', providerId: provider.id, providerRevision: 1, outcome };
  await recordAiInferenceOutcome(db, input);
  return input;
}
async function budget() {
  await db.$transaction(tx => recordAiBudgetNotification(tx, repo, org, 'owner', { id: 'route', revision: 1, stage: 'repository' }, '2026-10-10'));
  return db.notificationEvent.findFirstOrThrow({ where: { type: 'AI_REVIEW_BUDGET_REACHED' } });
}
it('debounces actual failures across three distinct reviews and deduplicates concurrent delivery signals', async () => {
  const first = await signal();
  await recordAiInferenceOutcome(db, first);
  expect(await db.auditEvent.count({ where: { event: 'ai.inference.transport_failed' } })).toBe(1);
  await signal();
  expect(await db.notificationEvent.count()).toBe(0);
  await db.auditEvent.updateMany({ where: { event: 'ai.inference.transport_failed' }, data: { createdAt: new Date(Date.now() - 90000) } });
  await Promise.all([signal(), signal(), signal()]);
  const events = await db.notificationEvent.findMany();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'AI_MODEL_UNAVAILABLE', severity: 'error', organizationId: org, repositoryId: repo.id, assessmentId: null, sourceSha: null });
  const persisted = JSON.stringify({ events, audit: await db.auditEvent.findMany() });
  expect(persisted).not.toContain('Private provider name');
  expect(persisted).not.toContain('fixture-model');
  expect(persisted).not.toContain('a'.repeat(40));
});
it('resets the failure window after a successful inference and respects the thirty-minute cooldown', async () => {
  await signal(); await signal();
  await db.auditEvent.updateMany({ where: { event: 'ai.inference.transport_failed' }, data: { createdAt: new Date(Date.now() - 90000) } });
  await signal('succeeded');
  await signal();
  expect(await db.notificationEvent.count()).toBe(0);
  await db.auditEvent.updateMany({ where: { event: 'ai.inference.succeeded' }, data: { createdAt: new Date(Date.now() - 120000) } });
  await signal();
  const event = await db.notificationEvent.findFirstOrThrow();
  await signal(); expect(await db.notificationEvent.count()).toBe(1);
  const previousAlertAt = new Date(Date.now() - 31 * 60000);
  const previousBucketId = event.id.replace(/-\d+$/, `-${Math.floor(previousAlertAt.getTime() / (30 * 60000))}`);
  await db.notificationEvent.update({ where: { id: event.id }, data: { id: previousBucketId, createdAt: previousAlertAt } });
  await signal(); expect(await db.notificationEvent.count()).toBe(2);
});
it('excludes cancelled jobs, changed providers, inactive requesters and unavailable repository scope', async () => {
  const first = await signal(); await db.auditEvent.deleteMany();
  await db.aiSkillReview.update({ where: { id: first.reviewId }, data: { state: 'CANCELLED' } });
  await recordAiInferenceOutcome(db, first);
  await db.aiSkillReview.update({ where: { id: first.reviewId }, data: { state: 'RUNNING' } });
  await recordAiInferenceOutcome(db, { ...first, providerRevision: 2 });
  await db.organizationMembership.update({ where: { id: 'member-owner' }, data: { active: false } });
  await recordAiInferenceOutcome(db, first);
  await db.organizationMembership.update({ where: { id: 'member-owner' }, data: { active: true } });
  await db.gitHubRepository.update({ where: { id: repo.id }, data: { selected: false } });
  await recordAiInferenceOutcome(db, first);
  expect(await db.auditEvent.count()).toBe(0); expect(await db.notificationEvent.count()).toBe(0);
});
it('sends AI configuration alerts only to current Owner/Admin despite assessment opt-out', async () => {
  await db.notificationPreference.create({ data: { identityId: 'owner', organizationId: org, assessments: false } });
  const event = await budget(); await budget(); await deliverNotification(db, event.id);
  expect((await db.inboxNotification.findMany()).map(row => row.identityId).sort()).toEqual(['admin', 'owner']);
  const inbox = new NotificationsService(db, new AuthorizationService(db));
  expect((await inbox.list(session(), { type: 'AI_REVIEW_BUDGET_REACHED', severity: 'warning', repository: '81818' })).total).toBe(1);
  await db.organizationMembership.update({ where: { id: 'member-owner' }, data: { role: 'DEVELOPER' } });
  expect((await inbox.list(session(), {})).items).toEqual([]);
  expect((await inbox.read(session())).updated).toBe(0);
  expect((await inbox.list({ ...session('admin'), organizationId: 'foreign' }, {})).items).toEqual([]);
});
it('rechecks current GitHub repository access when reading AI alerts or sending email', async () => {
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true');
  await db.notificationPreference.create({ data: { identityId: 'owner', organizationId: org, email: true, assessments: false } });
  const event = await budget(); await deliverNotification(db, event.id);
  const repositoryIds = vi.fn().mockResolvedValue([repo.githubId]);
  const auth = new AuthorizationService(db, { repositoryIds } as any);
  const inbox = new NotificationsService(db, auth);
  expect((await inbox.list(session(), {})).total).toBe(1);
  repositoryIds.mockResolvedValue([]);
  expect((await inbox.list(session(), {})).items).toEqual([]);
  const delivery = await db.notificationEmailDelivery.findFirstOrThrow();
  const mail = { send: vi.fn() }; await deliverNotificationEmail(db, auth, mail, delivery.id);
  expect(mail.send).not.toHaveBeenCalled();
  expect((await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).failureCode).toBe('ACCESS_REVOKED');
});
it('skips AI configuration email when an administrator is demoted even if repository access remains', async () => {
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true');
  await db.notificationPreference.create({ data: { identityId: 'owner', organizationId: org, email: true, assessments: false } });
  const event = await budget(); await deliverNotification(db, event.id);
  const delivery = await db.notificationEmailDelivery.findFirstOrThrow();
  await db.organizationMembership.update({ where: { id: 'member-owner' }, data: { role: 'DEVELOPER' } });
  const mail = { send: vi.fn() }; await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id);
  expect(mail.send).not.toHaveBeenCalled();
  expect((await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).failureCode).toBe('ACCESS_REVOKED');
});
it('includes scoped Security Engineers in native execution failure alerts and hides revoked scope', async () => {
  const event = await db.notificationEvent.create({ data: { organizationId: org, repositoryId: repo.id, repositoryGithubId: repo.githubId.toString(), repositoryName: repo.fullName, actorId: 'developer', sourceSha: 'a'.repeat(40), type: 'NATIVE_EXECUTION_FAILED', severity: 'error' } });
  await db.notificationPreference.create({ data: { identityId: 'security', organizationId: org, assessments: false } });
  await deliverNotification(db, event.id);
  expect((await db.inboxNotification.findMany()).map(row => row.identityId).sort()).toEqual(['admin', 'developer', 'lead', 'owner', 'security']);
  const inbox = new NotificationsService(db, new AuthorizationService(db));
  expect((await inbox.list(session('security'), { type: 'NATIVE_EXECUTION_FAILED' })).total).toBe(1);
  await db.repositoryGrant.deleteMany({ where: { membershipId: 'member-security' } });
  expect((await inbox.list(session('security'), {})).items).toEqual([]);
});
it('does not write AI alert signals or budget events when notifications are disabled', async () => {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'false');
  await signal();
  await db.$transaction(tx => recordAiBudgetNotification(tx, repo, org, 'owner', { id: 'route', revision: 1, stage: 'repository' }, '2026-10-10'));
  expect(await db.auditEvent.count()).toBe(0); expect(await db.notificationEvent.count()).toBe(0);
});

it('preserves mandatory critical/native email opt-in while assessment alerts are muted', async () => {
  vi.stubEnv('NOTIFICATION_EMAIL_ENABLED', 'true');
  await db.notificationPreference.create({ data: { identityId: 'security', organizationId: org, email: true, assessments: false } });
  const mail = { send: vi.fn().mockResolvedValue(undefined) };
  for (const type of ['CRITICAL_FINDINGS_REPORTED', 'NATIVE_EXECUTION_FAILED']) {
    const event = await db.notificationEvent.create({ data: { organizationId: org, repositoryId: repo.id, repositoryGithubId: repo.githubId.toString(), repositoryName: repo.fullName, sourceSha: 'a'.repeat(40), type, severity: 'error' } });
    await deliverNotification(db, event.id);
    const delivery = await db.notificationEmailDelivery.findFirstOrThrow({ where: { inbox: { identityId: 'security', eventId: event.id } } });
    await deliverNotificationEmail(db, new AuthorizationService(db), mail, delivery.id);
    expect((await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).state).toBe('SENT');
  }
  expect(mail.send).toHaveBeenCalledTimes(2);
});
