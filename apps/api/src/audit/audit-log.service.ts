import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthorizationService } from '../auth/authorization.service.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';

const labels: Record<string, string> = {
  organization_membership_changed: 'Member access updated',
  organization_created_with_explicit_owner: 'Workspace created',
  github_installation_connected: 'GitHub App connected',
  github_repository_selection_changed: 'Repository selection updated',
  'organization.settings.updated': 'Workspace settings updated',
  'assessment.created': 'Assessment created',
  'ci_bindings.adopted': 'Check sources connected',
  'ai.skill.approve': 'Review skill approved',
  'ai.skill.enable': 'Review skill enabled',
  'ai.skill.disable': 'Review skill disabled',
  'ai.review.summary_published': 'AI review posted to GitHub',
  'policy.super_admin_self_approved': 'Policy approved by proposing Super Admin',
  'github.readiness_automation_changed': 'Automatic PR checks updated',
  'pipeline.workflow.registered': 'Workflow connected automatically',
  'pipeline.workflow.connected': 'Workflow connected automatically',
  'github.automatic_readiness_verified': 'Automatic PR check verified',
  'github.automatic_readiness_configured': 'Automatic PR checks configured',
  'github.ruleset_deployment_proposed': 'Ruleset activation proposed',
  'github.ruleset_deployment_approved': 'Ruleset activation approved',
  'github.ruleset_super_admin_self_approved': 'Ruleset approved by proposing Super Admin',
  'github.ruleset_activation_verified': 'Ruleset activation verified',
  'github.ruleset_drift_detected': 'Ruleset changes detected on GitHub',
  'github.ruleset_rollback_verified': 'Managed ruleset disabled',
  'github.check_publication_requested': 'PR check publication requested',
  'github.check_publication_verified': 'PR check publication verified',
  'github.check_publication_unverified': 'PR check publication could not be verified',
  'ai.model.approved': 'AI model saved',
  'ai.provider.tested': 'AI model connection tested',
  'ai.route.saved': 'Model routing updated',
  'ai.route.inherits-default': 'Model routing reset to default',
  'ai.review.requested': 'AI review requested',
  'ai.review.finished': 'AI review finished',
  'ai.review.cancelled': 'AI review cancelled',
  'ai.review.feedback_published': 'AI review posted to GitHub',
  'policy.drafted': 'Policy draft created',
  'policy.draft_updated': 'Policy draft updated',
  'policy.approved': 'Policy approved',
  'policy.published': 'Policy published',
  'standards.selection.assigned': 'Repository standards assigned',
  'pipeline.run.verified': 'Workflow run verified',
  'pipeline.results.assessed': 'Workflow results assessed',
  'ai.skill.created': 'Review skill created',
  'standards.created': 'Standard created',
  'standards.version.created': 'Standard version created',
};
export function auditActionLabel(event: string) {
  return labels[event] ?? event.split(/[._-]+/).map((word) =>
    ({ ai: 'AI', ci: 'CI', github: 'GitHub', pr: 'PR', oidc: 'OIDC' }[word] ?? word)).join(' ').replace(/^./, (s) => s.toUpperCase());
}
export function auditFilters(input: Record<string, unknown>) {
  const text = (key: string, fallback = '') => {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string' || value.length > 160) throw new BadRequestException(`Invalid ${key} filter`);
    return value;
  };
  const page = text('page', '1');
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new BadRequestException('Invalid audit log page');
  const repository = text('repository', 'all');
  if (repository !== 'all' && !/^[1-9]\d{0,15}$/.test(repository)) throw new BadRequestException('Invalid repository filter');
  const action = text('action', 'all');
  if (!/^[A-Za-z0-9._-]+$/.test(action)) throw new BadRequestException('Invalid action filter');
  const date = (key: string) => {
    const value = text(key);
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
      throw new BadRequestException(`Invalid ${key} date; use YYYY-MM-DD`);
    return parsed;
  };
  const from = date('from'), to = date('to');
  if (from && to && from > to) throw new BadRequestException('Start date must be on or before end date');
  return { page: Number(page), repository, action, from, to: to ? new Date(to.getTime() + 86_400_000) : null };
}

// Resolve historical records through their actual source resources, never through
// the actor's current membership. Raw metadata remains server-side.
function contextSql(organizationId: string, repositoryIds: string[]) {
  const allowed = repositoryIds.length ? Prisma.sql`r.id IN (${Prisma.join(repositoryIds)})` : Prisma.sql`FALSE`;
  return Prisma.sql`WITH contextual AS (
    SELECT a.*, r.id AS "repositoryId", r."githubId"::text AS "repositoryGithubId", r."fullName" AS repository,
      COALESCE(i."organizationId", installation."organizationId", team."organizationId", NULLIF(a.metadata->>'organizationId', '')) AS "organizationId",
      (key.value IS NOT NULL OR a.metadata ?| ARRAY['deploymentId','publicationId','assessmentId','selectionId','draftId','policyId','requestId','reviewId','submissionId','taskId']) AS "repositoryReferenced"
    FROM "AuditEvent" a
    LEFT JOIN "GitHubRulesetDeployment" deployment ON deployment.id = a.metadata->>'deploymentId'
    LEFT JOIN "GitHubCheckPublication" publication ON publication.id = a.metadata->>'publicationId'
    LEFT JOIN "CommitAssessment" assessment ON assessment.id = a.metadata->>'assessmentId'
    LEFT JOIN "RepositoryStandardsSelection" selection ON selection.id = a.metadata->>'selectionId'
    LEFT JOIN "GitHubRulesetDraft" draft ON draft.id = a.metadata->>'draftId'
    LEFT JOIN "GatePolicyRevision" policy ON policy.id = a.metadata->>'policyId'
    LEFT JOIN "NativeExecutionRequest" execution ON execution.id = a.metadata->>'requestId'
    LEFT JOIN "AiSkillReview" review ON review.id = a.metadata->>'reviewId'
    LEFT JOIN "PipelineRunSubmission" submission ON submission.id = a.metadata->>'submissionId'
    LEFT JOIN "ReadinessTask" task ON task.id = a.metadata->>'taskId'
    LEFT JOIN "PreflytTeam" team ON team.id = a.metadata->>'teamId'
    CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(a.metadata->>'repositoryGithubId', ''), NULLIF(a.metadata->>'githubRepositoryId', ''),
      NULLIF(a.metadata->>'repositoryId', ''), deployment."repositoryId", publication."repositoryId", assessment."repositoryId",
      selection."repositoryId", draft."repositoryId", policy."repositoryId", execution."repositoryId", review."repositoryId", submission."repositoryId", task."repositoryId") AS value) key
    LEFT JOIN "GitHubRepository" r ON r.id = key.value OR r."githubId"::text = key.value
    LEFT JOIN "GitHubInstallation" i ON i.id = r."installationId"
    LEFT JOIN "GitHubInstallation" installation ON installation.id::text = a.metadata->>'installationId'
    WHERE (NULLIF(a.metadata->>'organizationId', '') IS NULL OR a.metadata->>'organizationId' = ${organizationId})
      AND (r.id IS NULL OR ${allowed})
  ), scoped AS (
    SELECT * FROM contextual WHERE "organizationId" = ${organizationId}
      AND ("repositoryId" IS NOT NULL OR NOT "repositoryReferenced")
  )`;
}
type AuditRow = { id: string; event: string; actorId: string | null; createdAt: Date; metadata: Prisma.JsonValue;
  repositoryId: string | null; repositoryGithubId: string | null; repository: string | null };
const detailKeys: Record<string, string> = {
  permission: 'Permission', packId: 'Standard', skillKey: 'Review skill', branchRef: 'Branch', prNumber: 'Pull request', sourceSha: 'Commit', revision: 'Version',
  conclusion: 'Check result', role: 'Role', active: 'Access active', enabled: 'Enabled', stage: 'Stage',
  modelId: 'Model', approvalKind: 'Approval', repositoryCount: 'Repositories',
  runId: 'Workflow run', checkRunId: 'GitHub check', githubRulesetId: 'GitHub ruleset',
};
function details(metadata: Prisma.JsonValue) {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return Object.entries(detailKeys).flatMap(([key, label]) => {
    const value = m[key];
    if (!['string', 'boolean', 'number'].includes(typeof value)) return [];
    return [{ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).slice(0, 250) }];
  });
}
@Injectable()
export class AuditLogService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService) {}
  async list(session: AuthenticatedSession, input: Record<string, unknown>) {
    const member = await this.access.requireOrganization(session, 'audit.read', true);
    const filters = auditFilters(input);
    const repositories = await this.access.repositoryScope(session.identityId, member.organizationId, 'repository.read', false);
    if (filters.repository !== 'all' && !repositories.some(r => r.githubId.toString() === filters.repository))
      throw new ForbiddenException('Repository audit history is not available to you');
    const context = contextSql(member.organizationId, repositories.map(r => r.id));
    const clauses = [Prisma.sql`TRUE`];
    if (filters.repository !== 'all') clauses.push(Prisma.sql`"repositoryGithubId" = ${filters.repository}`);
    if (filters.action !== 'all') clauses.push(Prisma.sql`event = ${filters.action}`);
    if (filters.from) clauses.push(Prisma.sql`"createdAt" >= ${filters.from}`);
    if (filters.to) clauses.push(Prisma.sql`"createdAt" < ${filters.to}`);
    const where = Prisma.join(clauses, ' AND ');
    const pageSize = 20;
    const [rows, counts, actions] = await this.db.$transaction(async tx => Promise.all([
      tx.$queryRaw<AuditRow[]>(Prisma.sql`${context} SELECT * FROM scoped WHERE ${where} ORDER BY "createdAt" DESC, id DESC LIMIT ${pageSize} OFFSET ${(filters.page - 1) * pageSize}`),
      tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`${context} SELECT COUNT(*) AS total FROM scoped WHERE ${where}`),
      tx.$queryRaw<{ event: string }[]>(Prisma.sql`${context} SELECT DISTINCT event FROM scoped ORDER BY event LIMIT 500`),
    ]), { isolationLevel: 'RepeatableRead', timeout: 15000 });
    const actors = await this.db.identity.findMany({ where: { id: { in: rows.flatMap(row => row.actorId ? [row.actorId] : []) } },
      select: { id: true, displayName: true, githubAccounts: { where: { host: 'github.com' }, select: { login: true }, take: 1 } } });
    const total = Number(counts[0].total);
    return { page: filters.page, pageSize, total, hasMore: filters.page * pageSize < total,
      repositories: repositories.map(r => ({ id: r.githubId.toString(), name: r.fullName })).sort((a,b) => a.name.localeCompare(b.name)),
      actions: actions.map(a => ({ id: a.event, label: auditActionLabel(a.event) })).sort((a,b) => a.label.localeCompare(b.label)),
      items: rows.map(row => {
        const actor = actors.find(a => a.id === row.actorId);
        return { id: row.id, action: row.event, actionLabel: auditActionLabel(row.event), createdAt: row.createdAt,
          actor: { id: row.actorId, name: row.actorId ? (actor?.displayName || actor?.githubAccounts[0]?.login || 'User ' + row.actorId.slice(0,8)) : 'Automated system' },
          repository: row.repositoryGithubId ? { id: row.repositoryGithubId, name: row.repository } : null,
          details: details(row.metadata) };
      }) };
  }
}
