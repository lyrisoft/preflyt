import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { disposableDatabase } from './disposable-database.js'
import { PipelinePolicyController } from '../src/assessments/pipeline-policy.controller.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { digest } from '../src/assessments/assessment-digest.js'
const identity = vi.hoisted(() => vi.fn())
vi.mock('../src/assessments/pipeline-identity.js', () => ({
  pipelineIdentity: identity,
}))
vi.mock('../src/standards/policy-standards.js', () => ({
  currentStandards: async () => ({ id: 'approved-selection' }),
}))
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
const sha = 'a'.repeat(40)
beforeAll(async () => {
  fixture = await disposableDatabase('branchsubmit')
})
afterAll(async () => {
  await fixture?.close()
})
beforeEach(async () => {
  await fixture.reset()
})
async function setup() {
  const db = fixture.prisma,
    org = await db.organization.create({ data: { name: 'fixture' } }),
    actor = await db.identity.create({
      data: { issuer: 'fixture', subject: 'owner' },
    })
  await db.organizationMembership.create({
    data: { identityId: actor.id, organizationId: org.id, role: 'OWNER' },
  })
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      organizationId: org.id,
      connectedById: actor.id,
      accountLogin: 'org',
      accountType: 'Organization',
      repositorySelection: 'all',
      permissions: {},
    },
  })
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: 51n,
      installationId: 50n,
      name: 'repo',
      fullName: 'org/repo',
      ownerLogin: 'org',
      isPrivate: true,
      selected: true,
      defaultBranch: 'main',
    },
  })
  await db.readinessAutomation.create({
    data: {
      repositoryId: repo.id,
      organizationId: org.id,
      actorId: actor.id,
      enabled: true,
    },
  })
  const definition = {
    rules: [{ id: 'tests.required', title: 'Tests', required: true }],
  }
  await db.gatePolicyRevision.create({
    data: {
      repositoryId: repo.id,
      organizationId: org.id,
      branchRef: 'refs/heads/main',
      revision: 1,
      selectionId: 'approved-selection',
      definition,
      definitionHash: digest(definition),
      state: 'PUBLISHED',
      draftedById: actor.id,
    },
  })
  identity.mockResolvedValue({
    repository_id: '51',
    repository: 'org/repo',
    run_id: '12',
    run_attempt: '1',
    sha,
    event_name: 'push',
    ref: 'refs/heads/main',
    workflow_ref: 'org/repo/.github/workflows/ci.yml@refs/heads/main',
  })
  const github = {
    readReadinessWorkflowRun: vi.fn(async () => ({
      event: 'push',
      headBranch: 'main',
      sourceSha: sha,
      runAttempt: 1,
      status: 'in_progress',
      workflowId: '4',
      workflowPath: '.github/workflows/ci.yml',
      runCreatedAt: '2026-10-18T08:00:00Z',
    })),
    readPipelineJobs: vi.fn(async () => [
      {
        id: '7',
        name: 'Preflyt policy checks',
        sourceSha: sha,
        status: 'in_progress',
      },
    ]),
  }
  const controller = new PipelinePolicyController(
      db,
      github as any,
      new AuthorizationService(db),
    ),
    policy = await controller.policy('Bearer fixture')
  const content = 'SF:app.ts\nDA:1,1\nLF:1\nLH:1\nend_of_record\n'
  const body = {
    schemaVersion: 1,
    verificationScope: 'jobs',
    jobName: 'Preflyt policy checks',
    policyId: policy.id,
    policyHash: policy.definitionHash,
    repositoryId: '51',
    sourceSha: sha,
    headSha: sha,
    results: [{ ruleId: 'tests.required', status: 'passed' }],
    reports: [
      {
        ruleId: 'tests.coverage',
        format: 'lcov',
        content,
        sha256: createHash('sha256').update(content).digest('hex'),
      },
    ],
  }
  return { db, controller, body, github, actor }
}
it('accepts an idempotent OIDC branch submission into its own queue without creating PR work', async () => {
  const { db, controller, body } = await setup()
  const first = await controller.submit('Bearer fixture', undefined, body),
    second = await controller.submit('Bearer fixture', undefined, body)
  expect(first.id).toBe(second.id)
  expect(first.id).toMatch(/^branch:/)
  expect(await db.repositoryBranchRun.count()).toBe(1)
  expect(await db.pipelineRunSubmission.count()).toBe(0)
  expect(await db.commitAssessment.count()).toBe(0)
  await expect(
    controller.submit('Bearer fixture', undefined, {
      ...body,
      results: [{ ruleId: 'tests.required', status: 'failed' }],
    }),
  ).rejects.toThrow('different content')
})
it('rejects missing job verification, ambiguous jobs and revoked publication access', async () => {
  const { db, controller, body, github, actor } = await setup()
  await expect(
    controller.submit('Bearer fixture', undefined, {
      ...body,
      verificationScope: undefined,
    }),
  ).rejects.toThrow('job verification')
  github.readPipelineJobs.mockResolvedValueOnce([
    {
      id: '7',
      name: 'Preflyt policy checks',
      sourceSha: sha,
      status: 'in_progress',
    },
    {
      id: '8',
      name: 'Preflyt policy checks',
      sourceSha: sha,
      status: 'in_progress',
    },
  ])
  await expect(
    controller.submit('Bearer fixture', undefined, body),
  ).rejects.toThrow()
  await db.organizationMembership.updateMany({
    where: { identityId: actor.id },
    data: { active: false },
  })
  await expect(
    controller.submit('Bearer fixture', undefined, body),
  ).rejects.toThrow()
  expect(await db.repositoryBranchRun.count()).toBe(0)
})
