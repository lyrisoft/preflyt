import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import { GitHubProviderService } from '../github/github-provider.service.js'
import { GitHubRateLimitError } from '../github/github-rate-limit.js'
import { CiArtifactService } from '../github-events/ci-artifact.service.js'
import { recordJobEvidence } from '../assessments/pipeline-job-evidence.js'
import { CiAttestationService } from '../github-events/ci-attestation.service.js'
import { CiAttestationVerifier } from '../github-events/ci-attestation-verifier.js'
import { digest } from '../assessments/assessment-digest.js'

/** Branch reports have their own receipts and never create a PR assessment or publish a gate. */
export class BranchCiService {
  constructor(
    private db: PrismaService,
    private access: AuthorizationService,
    private github: GitHubProviderService,
  ) {}
  async reconcile() {
    const now = new Date()
    const rows = await this.db.repositoryBranchRun.findMany({
      where: {
        state: { in: ['PENDING', 'PROCESSING'] },
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    })
    for (const row of rows) {
      const token = randomUUID()
      const claim = await this.db.repositoryBranchRun.updateMany({
        where: {
          id: row.id,
          state: { in: ['PENDING', 'PROCESSING'] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          state: 'PROCESSING',
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 180000),
        },
      })
      if (!claim.count) continue
      const finish = (data: any) =>
        this.db.repositoryBranchRun.updateMany({
          where: { id: row.id, leaseToken: token },
          data: { ...data, leaseToken: null, leaseUntil: null },
        })
      try {
        const repo = await this.db.gitHubRepository.findUniqueOrThrow({
          where: { id: row.repositoryId },
          include: { readinessAutomation: true },
        })
        const config = repo.readinessAutomation
        const policy = await this.db.gatePolicyRevision.findUnique({
          where: { id: row.policyId },
        })
        if (
          !config?.enabled ||
          config.revision !== row.configRevision ||
          config.actorId !== row.actorId ||
          config.organizationId !== row.organizationId ||
          !repo.selected ||
          !repo.available ||
          policy?.state !== 'PUBLISHED' ||
          policy.repositoryId !== repo.id ||
          policy.organizationId !== row.organizationId ||
          policy.branchRef !== `refs/heads/${row.branch}` ||
          policy.definitionHash !== row.policyHash ||
          digest(policy.definition) !== row.policyHash
        )
          throw new Error('CONFIGURATION_CHANGED')
        const session = {
          authenticated: true as const,
          identityId: row.actorId,
          subject: row.actorId,
          email: null,
          role: 'WORKER',
          organizationId: row.organizationId,
        }
        await this.access.requireRepository(
          session,
          repo.githubId.toString(),
          'policy.publish',
        )
        const payload = row.payload as any
        if (digest(payload) !== row.inputHash)
          throw new Error('REPORT_INTEGRITY_FAILED')
        const run = await this.github.readReadinessWorkflowRun(
          repo.installationId,
          repo.githubId,
          row.runId,
        )
        const validRun = (value: typeof run) =>
          value.event === 'push' &&
          value.headBranch === row.branch &&
          value.sourceSha === row.sourceSha &&
          value.runAttempt === row.runAttempt &&
          value.workflowId === row.workflowId &&
          payload.signerWorkflow === `${repo.fullName}/${value.workflowPath}`
        if (!validRun(run)) throw new Error('RUN_CHANGED')
        if (run.status !== 'completed') {
          if (Date.now() - row.createdAt.getTime() > 24 * 3600000)
            throw new Error('WORKFLOW_COMPLETION_TIMEOUT')
          await finish({
            state: 'PENDING',
            failureCode: null,
            nextAttemptAt: new Date(Date.now() + 30000),
          })
          continue
        }
        const jobs = await this.github.readPipelineJobs(
          repo.installationId,
          repo.githubId,
          row.runId,
          row.runAttempt,
        )
        const job = jobs.find(
          (j) =>
            j.id === payload.submissionJobId && j.sourceSha === row.sourceSha,
        )
        // Verify the report-producing job, not an unrelated successful job in this workflow.
        if (
          !job ||
          job.status !== 'completed' ||
          job.conclusion !== 'success' ||
          !job.steps.length ||
          job.steps.some(
            (s: { status: string; conclusion: string }) =>
              s.status !== 'completed' ||
              !['success', 'skipped'].includes(s.conclusion),
          )
        )
          throw new Error('REPORT_JOB_FAILED')
        const evidence = await recordJobEvidence(this.db, {
          submissionId: row.id,
          repositoryId: repo.githubId,
          installationId: repo.installationId,
          sourceSha: row.sourceSha,
          runId: row.runId,
          runAttempt: row.runAttempt,
          workflowId: row.workflowId,
          jobIds: [job.id],
          conclusion: 'success',
        })
        const artifacts = new CiArtifactService(this.db)
        // Only tests/coverage belong to this read-only projection. Other check results never enter PR evaluation.
        const reports = payload.reports.filter((r: any) =>
          ['tests.required', 'tests.coverage'].includes(r.ruleId),
        )
        for (const report of reports) {
          await this.access.requireRepository(
            session,
            repo.githubId.toString(),
            'policy.publish',
          )
          const imported = await artifacts.import(
            repo.githubId.toString(),
            evidence.deliveryId,
            report,
            row.actorId,
          )
          if (report.proof) {
            try {
              await new CiAttestationService(
                this.db,
                new CiAttestationVerifier(),
              ).verify(
                repo.githubId.toString(),
                evidence.deliveryId,
                imported.artifact.id,
                {
                  bundle: report.proof,
                  signerWorkflow: payload.signerWorkflow,
                },
                row.actorId,
              )
            } catch {
              throw new Error('REPORT_PROOF_UNVERIFIED')
            }
          } else if (
            (process.env.CI_REPORT_PROOF_MODE ?? 'github-native') !==
            'github-native'
          )
            throw new Error('REPORT_PROOF_UNVERIFIED')
        }
        const fresh = await this.github.readReadinessWorkflowRun(
          repo.installationId,
          repo.githubId,
          row.runId,
        )
        if (!validRun(fresh) || fresh.status !== 'completed')
          throw new Error('RUN_CHANGED')
        await this.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repo.id} FOR UPDATE`
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            repo.githubId.toString(),
            'policy.publish',
          )
          const current = await tx.readinessAutomation.findUnique({
            where: { repositoryId: repo.id },
          })
          const currentPolicy = await tx.gatePolicyRevision.findUnique({
            where: { id: row.policyId },
          })
          if (
            !current?.enabled ||
            current.revision !== row.configRevision ||
            current.actorId !== row.actorId ||
            current.organizationId !== row.organizationId ||
            currentPolicy?.state !== 'PUBLISHED' ||
            currentPolicy.definitionHash !== row.policyHash ||
            digest(currentPolicy.definition) !== row.policyHash
          )
            throw new Error('CONFIGURATION_CHANGED')
          const held = await tx.repositoryBranchRun.updateMany({
            where: {
              id: row.id,
              leaseToken: token,
              leaseUntil: { gt: new Date() },
            },
            data: {
              state: 'VERIFIED',
              payload: {},
              finishedAt: new Date(),
              failureCode: reports.some(
                (r: any) => r.ruleId === 'tests.coverage',
              )
                ? null
                : 'COVERAGE_NOT_RECEIVED',
              leaseToken: null,
              leaseUntil: null,
            },
          })
          if (!held.count) throw new Error('LEASE_LOST')
          await tx.auditEvent.createMany({
            data: [
              {
                id: `branch-verified:${row.id}`,
                event: 'branch.run.verified',
                actorId: row.actorId,
                metadata: {
                  schemaVersion: 1,
                  repositoryId: repo.id,
                  organizationId: row.organizationId,
                  branch: row.branch,
                  sourceSha: row.sourceSha,
                  submissionId: row.id,
                  runId: row.runId,
                  runAttempt: row.runAttempt,
                  workflowId: row.workflowId,
                  policyId: row.policyId,
                  policyHash: row.policyHash,
                  verificationScope: 'jobs',
                  jobIds: [job.id],
                  verifiedAt: new Date().toISOString(),
                  reports: reports.map((r: any) => ({
                    ruleId: r.ruleId,
                    sha256: r.sha256,
                    format: r.format,
                  })),
                },
              },
            ],
            skipDuplicates: true,
          })
        })
      } catch (error) {
        if (error instanceof GitHubRateLimitError) {
          await finish({
            state: 'PENDING',
            failureCode: 'GITHUB_RATE_LIMITED',
            nextAttemptAt: new Date(
              (error.getResponse() as { retryAt: string }).retryAt,
            ),
          })
        } else {
          const code = error instanceof Error ? error.message : ''
          const terminal = [
            'REPORT_PROOF_UNVERIFIED',
            'CONFIGURATION_CHANGED',
            'REPORT_INTEGRITY_FAILED',
            'RUN_CHANGED',
            'REPORT_JOB_FAILED',
            'WORKFLOW_COMPLETION_TIMEOUT',
          ].includes(code)
          const failed = terminal || row.attempts >= 4
          await finish({
            state: failed ? 'FAILED' : 'PENDING',
            failureCode: terminal ? code : 'VERIFICATION_FAILED',
            attempts: { increment: 1 },
            nextAttemptAt: new Date(
              Date.now() + Math.min(300000, 30000 * 2 ** row.attempts),
            ),
            ...(failed ? { finishedAt: new Date(), payload: {} } : {}),
          })
        }
      }
    }
  }
}
