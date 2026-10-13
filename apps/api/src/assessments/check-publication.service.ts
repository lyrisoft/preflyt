import { currentStandards, selectionBindingWhere } from '../standards/policy-standards.js'
import { Optional } from '@nestjs/common'
import { PolicyExceptionService } from './policy-exception.service.js'
import { applyApprovedExceptions } from './approved-policy-evaluation.js'
import { previewGate } from './gate-preview.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import { verifyTeamContext } from '../teams/team-context.js'
import { readLatestNativeEvidence } from '../execution/native-evidence.js'
import { evaluatePublishedPolicy } from './published-policy-evaluation.js'
import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { GitHubProviderService } from '../github/github-provider.service.js'
import { readPullRequestContext } from '../github-events/pull-request-context.js'
import { digest } from './assessment-digest.js'
import { publicationPayload } from './check-publication.js'
import { AssessmentService } from './assessment.service.js'
@Injectable()
export class CheckPublicationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
    @Inject(AssessmentService) private readonly assessments: AssessmentService,
    @Optional() @Inject(PolicyExceptionService) private readonly exceptions?: PolicyExceptionService,
  ) {}
  async list(session: AuthenticatedSession, githubId: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid publication page')
    const repo = await this.access.requireRepository(
      session,
      githubId,
      'policy.read',
    )
    const rows = await this.prisma.gitHubCheckPublication.findMany({
      where: { repositoryId: repo.id, organizationId: session.organizationId! },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 21,
    })
    await this.access.requireRepository(session, githubId, 'policy.read')
    return {
      enabled: configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') === 'true',
      publicationMode: 'POLICY_AWARE',
      activationAvailable:
        configurationValue('GITHUB_RULESET_ACTIVATION_ENABLED') === 'true',
      page,
      hasMore: rows.length > 20,
      publications: rows
        .slice(0, 20)
        .map(({ leaseToken: _lease, ...row }) => row),
    }
  }
  async prChecks(session: AuthenticatedSession, githubId: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid PR checks page')
    const repo = await this.access.requireRepository(session, githubId, 'policy.read')
    const rows = await this.prisma.$queryRaw<{
      id: string; assessmentId: string | null; prNumber: number;
      sourceSha: string | null; branchRef: string | null; state: string;
      conclusion: string | null; htmlUrl: string | null;
      verifiedAt: Date | null; updatedAt: Date;
    }[]>`
      WITH checks AS (
        SELECT "id", "assessmentId", "prNumber", "sourceSha", NULL::text AS "branchRef",
          "state", "conclusion", "htmlUrl", "verifiedAt", "updatedAt"
        FROM "GitHubCheckPublication"
        WHERE "repositoryId" = ${repo.id} AND "organizationId" = ${session.organizationId!}
        UNION ALL
        SELECT "id", "assessmentId", "prNumber", "sourceSha", "branchRef",
          "state", "conclusion", "htmlUrl", "verifiedAt", "updatedAt"
        FROM "ReadinessTask" WHERE "repositoryId" = ${repo.id}
      ), latest AS (
        SELECT DISTINCT ON ("prNumber") * FROM checks
        ORDER BY "prNumber", "updatedAt" DESC, "id" DESC
      )
      SELECT * FROM latest ORDER BY "updatedAt" DESC, "id" DESC
      LIMIT 21 OFFSET ${(page - 1) * 20}
    `
    await this.access.requireRepository(session, githubId, 'policy.read')
    return {
      enabled: configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') === 'true',
      hasMore: rows.length > 20,
      publications: rows.slice(0, 20),
    }
  }
  async preview(
    session: AuthenticatedSession,
    githubId: string,
    prNumber: number,
    assessmentId: string,
  ) {
    const plan = await this.plan(
      session,
      githubId,
      prNumber,
      assessmentId,
      'policy.read',
    )
    return {
      previewHash: plan.previewHash,
      sourceSha: plan.assessment.sourceSha,
      assessmentId,
      prNumber,
      appId: plan.appId,
      name: plan.payload.name,
      conclusion: plan.payload.conclusion,
      gateStatus: plan.gate.status,
      output: plan.payload.output,
      enabled: configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') === 'true',
      activationAvailable:
        configurationValue('GITHUB_RULESET_ACTIVATION_ENABLED') === 'true',
      policy: plan.policy
        ? {
            id: plan.policy.id,
            revision: plan.policy.revision,
            definitionHash: plan.policy.definitionHash,
          }
        : null,
      evaluationHash: plan.policyEvaluation?.evaluationHash ?? null,
      publicationMode: plan.policy ? 'PUBLISHED_POLICY' : 'OBSERVE_NON_PASSING',
    }
  }
  async plan(
    session: AuthenticatedSession,
    githubId: string,
    prNumber: number,
    assessmentId: string,
    permission: string,
  ) {
    if (
      !Number.isInteger(prNumber) ||
      prNumber < 1 ||
      prNumber > 2147483647 ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(assessmentId)
    )
      throw new BadRequestException(
        'Choose a pull request and saved assessment',
      )
    const repo = await this.access.requireRepository(
      session,
      githubId,
      permission,
    )
    const assessment = await this.assessments.get(githubId, assessmentId)
    const remote = await this.github.readPullRequest(
      repo.installationId,
      repo.githubId,
      prNumber,
    )
    const context = readPullRequestContext(remote.context)
    if (
      !context ||
      context.state !== 'open' ||
      context.merged ||
      context.draft ||
      context.head.repositoryId !== githubId ||
      context.base.repositoryId !== githubId ||
      context.head.sha !== assessment.sourceSha
    )
      throw new ConflictException(
        'Choose the latest assessment for an open, non-draft pull request in this repository. Forks and merge-queue commits are not supported yet.',
      )
    const selection = await currentStandards(this.prisma, repo.id, { branchRef: `refs/heads/${context.base.ref}` })
    const [binding, latest] = await Promise.all([
      this.prisma.repositoryCiBindings.findFirst({
        where: selectionBindingWhere(repo.id, selection?.id),
        orderBy: { revision: 'desc' },
      }),
      this.prisma.commitAssessment.findFirst({
        where: { repositoryId: repo.id, sourceSha: assessment.sourceSha, ...(selection?.standardsSource === 'POLICY' ? { selectionId: selection.id } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])
    const request = assessment.request as Record<string, any>
    const bindingId =
      binding?.selectionId === selection?.id ? (binding?.id ?? null) : null
    if (
      !selection ||
      assessment.selectionId !== selection.id ||
      latest?.id !== assessment.id ||
      request.installationId !== repo.installationId.toString() ||
      (request.sourceBindings?.id ?? null) !== bindingId
    )
      throw new ConflictException(
        'Standards, CI sources, or the assessment changed. Create or select the latest assessment and preview again.',
      )
    if (
      request.subjectKind === 'PULL_REQUEST' &&
      digest(request.pullRequest) !==
        digest({
          ...context,
          number: prNumber,
          objectId: remote.sourceObjectId,
        })
    )
      throw new ConflictException(
        'The pull request changed since this assessment. Create a new assessment.',
      )
    const { appId } = await this.github.checkPublicationAccess(
      repo.installationId,
    )
    const policy = await this.prisma.gatePolicyRevision.findFirst({
      where: {
        repositoryId: repo.id,
        organizationId: session.organizationId!,
        branchRef: `refs/heads/${context.base.ref}`,
        state: 'PUBLISHED',
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    })
    if (policy) await verifyTeamContext(this.prisma, repo.id, (policy.definition as any).teamContext)
    const report = assessment.report as Record<string, any>
    const liveRuns: Record<
      string,
      Awaited<ReturnType<GitHubProviderService['readPipelineVerificationRun']>>
    > = {}
    if (policy) {
      const runIds = [
        ...new Set<string>(
          (report.observations ?? [])
            .filter(
              (o: any) =>
                ['workflow_run', 'workflow_jobs'].includes(o.sourceKind) &&
                report.checks?.some((c: any) => c.deliveryId === o.deliveryId),
            )
            .map((o: any) => o.sourceObjectId),
        ),
      ]
      if (runIds.length > 32)
        throw new ConflictException(
          'Too many CI sources. Review the source mappings before publication.',
        )
      for (const runId of runIds)
        liveRuns[runId] = await this.github.readPipelineVerificationRun(
          repo.installationId,
          repo.githubId,
          runId,
        )
    }
    const nativeEvidence =
      policy &&
      Array.isArray(report.nativeExecutions) &&
      report.nativeExecutions.length
        ? await readLatestNativeEvidence(this.prisma, {
            repositoryId: repo.id,
            organizationId: session.organizationId!,
            sourceSha: assessment.sourceSha,
            selectionId: selection!.id,
          })
        : []
    const observedEvaluation = policy
      ? evaluatePublishedPolicy(
          assessment,
          policy,
          `refs/heads/${context.base.ref}`,
          liveRuns,
          new Date(),
          nativeEvidence,
        )
      : undefined
    const approvedExceptions = policy && this.exceptions ? await this.exceptions.active(session, githubId, { organizationId: session.organizationId!, repositoryId: repo.id, policyId: policy.id, policyHash: policy.definitionHash, branchRef: `refs/heads/${context.base.ref}`, sourceSha: assessment.sourceSha }) : []
    const policyEvaluation = observedEvaluation && approvedExceptions.length ? applyApprovedExceptions(observedEvaluation, approvedExceptions, policy!.definition as any, previewGate(assessment).reasons.length === 0) : observedEvaluation
    const id = digest({
      repositoryId: repo.id,
      installationId: repo.installationId.toString(),
      assessmentHash: assessment.assessmentHash,
      prNumber,
      context,
      ...(policyEvaluation
        ? {
            policyHash: policy!.definitionHash,
            evaluationHash: policyEvaluation.evaluationHash,
          }
        : {}),
    })
    const { gate, payload } = publicationPayload(
      assessment,
      id,
      policyEvaluation,
    )
    const previewHash = digest({
      id,
      context,
      payload,
      appId,
      selectionId: selection.id,
      bindingId,
    })
    await this.access.requireRepository(session, githubId, permission)
    return {
      repo,
      assessment,
      policy,
      policyEvaluation,
      exceptionExpiry: approvedExceptions.map(row => row.expiresAt.toISOString()),
      context,
      prNumber,
      appId,
      id,
      gate,
      payload,
      previewHash,
    }
  }
  async publish(
    session: AuthenticatedSession,
    githubId: string,
    input: {
      prNumber: number
      assessmentId: string
      expectedPreviewHash: string
    },
  ) {
    if (configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') !== 'true')
      throw new ServiceUnavailableException(
        'Check publication is disabled. Configure GITHUB_CHECK_PUBLICATION_ENABLED before publishing.',
      )
    if (!/^[a-f0-9]{64}$/.test(input.expectedPreviewHash))
      throw new BadRequestException(
        'Review the check preview before publishing',
      )
    const plan = await this.plan(
      session,
      githubId,
      input.prNumber,
      input.assessmentId,
      'policy.publish',
    )
    if (plan.previewHash !== input.expectedPreviewHash)
      throw new ConflictException(
        'The check preview changed. Reload and review before publishing.',
      )
    const leaseToken = randomUUID()
    let claim
    try {
      claim = await this.prisma.$transaction(
        async (tx) => {
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            githubId,
            'policy.publish',
          )
          const previous = await tx.gitHubCheckPublication.findUnique({
            where: { id: plan.id },
          })
          if (previous?.state === 'PUBLISHED') return previous
          if (
            previous?.state === 'PUBLISHING' &&
            previous.updatedAt.getTime() > Date.now() - 120_000
          )
            throw new ConflictException(
              'Publication is still in progress. Refresh history before retrying.',
            )
          const data = {
            leaseToken,
            actorId: session.identityId,
            state: 'PUBLISHING',
          }
          const row = previous
            ? await tx.gitHubCheckPublication.update({
                where: { id: plan.id },
                data,
              })
            : await tx.gitHubCheckPublication.create({
                data: {
                  ...data,
                  id: plan.id,
                  repositoryId: plan.repo.id,
                  organizationId: session.organizationId!,
                  assessmentId: plan.assessment.id,
                  prNumber: input.prNumber,
                  sourceSha: plan.assessment.sourceSha,
                  installationId: plan.repo.installationId.toString(),
                  previewHash: plan.previewHash,
                  policyId: plan.policy?.id ?? null,
                  policyHash: plan.policy?.definitionHash ?? null,
                  evaluationHash: plan.policyEvaluation?.evaluationHash ?? null,
                  conclusion: plan.payload.conclusion,
                },
              })
          await tx.auditEvent.create({
            data: {
              event: 'github.check_publication_requested',
              actorId: session.identityId,
              metadata: {
                publicationId: plan.id,
                previewHash: plan.previewHash,
                policyId: plan.policy?.id ?? null,
                policyHash: plan.policy?.definitionHash ?? null,
                evaluationHash: plan.policyEvaluation?.evaluationHash ?? null,
                repositoryGithubId: githubId,
                sourceSha: row.sourceSha,
                conclusion: row.conclusion,
              },
            },
          })
          return row
        },
        { isolationLevel: 'Serializable' },
      )
    } catch (error) {
      if (['P2002', 'P2034'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException(
          'Another publication is in progress. Refresh and try again.',
        )
      throw error
    }
    if (claim.state === 'PUBLISHED') {
      const { leaseToken: _lease, ...receipt } = claim
      return receipt
    }
    try {
      // Recheck upstream head/base and evidence immediately before publication.
      const latest = await this.plan(
        session,
        githubId,
        input.prNumber,
        input.assessmentId,
        'policy.publish',
      )
      if (latest.previewHash !== plan.previewHash)
        throw new ConflictException(
          'The pull request or assessment changed. Preview again.',
        )
      const receipt = await this.github.publishReadinessCheck(
        plan.repo.installationId,
        plan.repo.githubId,
        plan.payload,
        !!plan.policyEvaluation,
      )
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.gitHubCheckPublication.updateMany({
          where: { id: plan.id, leaseToken, state: 'PUBLISHING' },
          data: { state: 'PUBLISHED', ...receipt, verifiedAt: new Date() },
        })
        if (updated.count !== 1)
          throw new ConflictException(
            'Publication ownership changed. Refresh history.',
          )
        await tx.auditEvent.create({
          data: {
            event: 'github.check_publication_verified',
            actorId: session.identityId,
            metadata: {
              publicationId: plan.id,
              ...receipt,
              sourceSha: plan.assessment.sourceSha,
              conclusion: plan.payload.conclusion,
              activationAvailable:
                configurationValue('GITHUB_RULESET_ACTIVATION_ENABLED') === 'true',
            },
          },
        })
        return tx.gitHubCheckPublication.findUniqueOrThrow({
          where: { id: plan.id },
        })
      })
      const { leaseToken: _lease, ...response } = result
      return response
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.gitHubCheckPublication.updateMany({
          where: { id: plan.id, leaseToken, state: 'PUBLISHING' },
          data: { state: 'UNKNOWN' },
        })
        if (updated.count === 1)
          await tx.auditEvent.create({
            data: {
              event: 'github.check_publication_unverified',
              actorId: session.identityId,
              metadata: {
                publicationId: plan.id,
                sourceSha: plan.assessment.sourceSha,
                conclusion: plan.payload.conclusion,
              },
            },
          })
      })
      if (error instanceof ConflictException) throw error
      throw new ServiceUnavailableException(
        'Publication could not be verified. Refresh history, then retry the same preview to recover an existing check. Review GitHub before retrying.',
      )
    }
  }
}
