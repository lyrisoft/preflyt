import { rolePermissions } from '../auth/authorization.service.js';
import { digest } from '../assessments/assessment-digest.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { notificationsEnabled } from './notification-event.js';

export const aiNotificationTypes = ['AI_MODEL_UNAVAILABLE', 'AI_REVIEW_BUDGET_REACHED'];
export const isAiNotification = (type: string) => aiNotificationTypes.includes(type);
const outageWindowMs = 10 * 60000;
const outageMinimumSpanMs = 60000;
const alertCooldownMs = 30 * 60000;
type Repository = { id: string; githubId: bigint; fullName: string };

/** Called only at an actual admission rejection; a reservation is a limit, not billed spend. */
export async function recordAiBudgetNotification(
  tx: Prisma.TransactionClient,
  repo: Repository,
  organizationId: string,
  actorId: string,
  route: { id: string; revision: number; stage: string },
  day: string,
) {
  if (!notificationsEnabled()) return;
  await tx.notificationEvent.createMany({
    data: [{
      id: digest({ kind: 'ai-review-budget', organizationId, routeId: route.id, revision: route.revision, day }),
      organizationId,
      repositoryId: repo.id,
      repositoryGithubId: repo.githubId.toString(),
      repositoryName: repo.fullName,
      actorId,
      type: 'AI_REVIEW_BUDGET_REACHED',
      severity: 'warning',
    }],
    skipDuplicates: true,
  });
}

/** Durable, bounded debounce across workers; no provider text, keys, prompts or source. */
export type AiInferenceOutcome = {
  reviewId: string;
  organizationId: string;
  actorId: string;
  repositoryId: string;
  providerId: string;
  providerRevision: number;
  outcome: 'transport_failed' | 'succeeded';
};
export async function recordAiInferenceOutcome(db: PrismaService, input: AiInferenceOutcome) {
  if (!notificationsEnabled()) return;
  return db.$transaction(tx => recordAiInferenceOutcomeInTransaction(tx, input));
}
export async function recordAiInferenceOutcomeInTransaction(tx: Prisma.TransactionClient, input: AiInferenceOutcome) {
  if (!notificationsEnabled()) return;
    // A connection row serializes the signal stream without new runtime state/schema.
    await tx.$queryRaw`SELECT id FROM "AiProviderConnection" WHERE id = ${input.providerId} FOR UPDATE`;
    const provider = await tx.aiProviderConnection.findFirst({ where: {
      id: input.providerId, organizationId: input.organizationId, revision: input.providerRevision, enabled: true,
    } });
    const job = await tx.aiSkillReview.findFirst({ where: {
      id: input.reviewId, organizationId: input.organizationId, repositoryId: input.repositoryId,
      actorId: input.actorId, state: 'RUNNING',
    } });
    const repo = await tx.gitHubRepository.findFirst({ where: {
      id: input.repositoryId, selected: true, available: true,
      installation: { active: true, organizationId: input.organizationId },
    } });
    const actor = await tx.organizationMembership.findFirst({ where: {
      identityId: input.actorId, organizationId: input.organizationId, active: true,
      OR: [{ role: { in: ['OWNER', 'ADMIN'] } }, { grants: { some: { repositoryId: input.repositoryId } } }],
    } });
    if (!provider || !job || !repo || !actor || !rolePermissions[actor.role]?.includes('ai.review.run')) return;
    const traceKey = digest({ organizationId: input.organizationId, providerId: provider.id, revision: provider.revision });
    await tx.auditEvent.createMany({
      data: [{
        id: digest({ kind: 'ai-inference-signal', reviewId: job.id, traceKey, outcome: input.outcome }),
        actorId: input.actorId,
        event: `ai.inference.${input.outcome}`,
        metadata: { organizationId: input.organizationId, reviewId: job.id, providerId: provider.id, revision: provider.revision, traceKey },
      }],
      skipDuplicates: true,
    });
    if (input.outcome === 'succeeded') return;
    const now = Date.now();
    const success = await tx.auditEvent.findFirst({ where: {
      event: 'ai.inference.succeeded', metadata: { path: ['traceKey'], equals: traceKey },
      createdAt: { gte: new Date(now - outageWindowMs) },
    }, orderBy: { createdAt: 'desc' } });
    const failures = await tx.auditEvent.findMany({ where: {
      event: 'ai.inference.transport_failed', metadata: { path: ['traceKey'], equals: traceKey },
      createdAt: { gte: new Date(now - outageWindowMs), ...(success ? { gt: success.createdAt } : {}) },
    }, orderBy: { createdAt: 'desc' }, take: 20 });
    const distinctReviews = new Set(failures.map(row => (row.metadata as { reviewId?: string }).reviewId));
    if (distinctReviews.size < 3 || !failures.length || failures[0]!.createdAt.getTime() - failures[failures.length - 1]!.createdAt.getTime() < outageMinimumSpanMs) return;
    const prefix = `aim-${traceKey}-`;
    if (await tx.notificationEvent.findFirst({ where: {
      organizationId: input.organizationId, type: 'AI_MODEL_UNAVAILABLE', id: { startsWith: prefix },
      createdAt: { gte: new Date(now - alertCooldownMs) },
    } })) return;
    await tx.notificationEvent.createMany({
      data: [{
        id: prefix + Math.floor(now / alertCooldownMs),
        organizationId: input.organizationId,
        repositoryId: repo.id,
        repositoryGithubId: repo.githubId.toString(),
        repositoryName: repo.fullName,
        actorId: input.actorId,
        type: 'AI_MODEL_UNAVAILABLE',
        severity: 'error',
      }],
      skipDuplicates: true,
    });
}
