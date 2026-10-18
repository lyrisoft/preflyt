import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { disposableDatabase } from './disposable-database.js'
import { FindingsService } from '../src/findings/findings.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { digest } from '../src/assessments/assessment-digest.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, service: FindingsService, session: any
const sha = 'a'.repeat(40)
beforeAll(async () => {
  fixture = await disposableDatabase('projection')
})
afterAll(async () => {
  await fixture.close()
})
beforeEach(async () => {
  await fixture.reset()
  const db = fixture.prisma
  await db.organization.create({ data: { id: 'org', name: 'Fixture' } })
  await db.identity.create({ data: { id: 'owner', issuer: 'fixture', subject: 'owner' } })
  await db.organizationMembership.create({
    data: { organizationId: 'org', identityId: 'owner', role: 'OWNER' },
  })
  await db.gitHubInstallation.create({
    data: {
      id: 1n,
      organizationId: 'org',
      connectedById: 'owner',
      accountLogin: 'fixture',
      accountType: 'Organization',
      repositorySelection: 'all',
      permissions: {},
    },
  })
  await db.gitHubRepository.create({
    data: {
      id: 'repo',
      githubId: 51n,
      installationId: 1n,
      name: 'repo',
      fullName: 'fixture/repo',
      ownerLogin: 'fixture',
      isPrivate: true,
      selected: true,
    },
  })
  session = {
    authenticated: true,
    organizationId: 'org',
    identityId: 'owner',
    subject: 'owner',
    role: 'OWNER',
    email: null,
  }
  service = new FindingsService(db, new AuthorizationService(db), {} as any)
})
async function health() {
  return fixture.prisma.repositoryHealthAssessment.create({
    data: {
      id: '00000000-0000-4000-8000-000000000001',
      repositoryId: 'repo',
      organizationId: 'org',
      branch: 'main',
      targetRevision: 1,
      requestKey: 'scan',
      actorId: 'owner',
      state: 'COMPLETED',
      sourceSha: sha,
      report: {
        completeness: 'COMPLETE',
        findings: [
          {
            fingerprint: 'f'.repeat(64),
            ruleId: 'duplicates',
            title: 'Repeated code',
            category: 'duplication',
            severity: 'low',
            path: 'src/a.ts',
            line: 4,
            evidence: 'ANALYZER_REPORTED',
          },
        ],
      },
    },
  })
}
async function ci() {
  const db = fixture.prisma,
    content =
      '<testsuite><testcase name="Fixture test"><failure>failed</failure></testcase></testsuite>',
    sha256 = createHash('sha256').update(content).digest('hex')
  await db.gitHubWebhookDelivery.create({
    data: {
      id: 'delivery',
      event: 'check_run',
      action: 'completed',
      payloadHash: 'fixture',
      installationId: 1n,
      repositoryGithubId: 51n,
      sourceSha: sha,
      sourceObjectId: '1',
    },
  })
  await db.importedCiEvidence.create({
    data: {
      deliveryId: 'delivery',
      repositoryGithubId: 51n,
      installationId: 1n,
      sourceSha: sha,
      sourceKind: 'CHECK_RUN',
      sourceObjectId: '1',
      sourceAction: 'completed',
      result: 'FAILED',
      sourcePayloadHash: 'fixture',
      evidenceHash: 'fixture',
      observedAt: new Date(),
    },
  })
  await db.ciArtifactImport.create({
    data: {
      id: 'artifact',
      deliveryId: 'delivery',
      format: 'junit',
      sha256,
      content: Buffer.from(content),
      summary: {},
      uploadedById: 'owner',
    },
  })
  const request = { subjectKind: 'PULL_REQUEST', pullRequest: { number: 1 } },
    plan = { checks: [] },
    report = { observations: [{ deliveryId: 'delivery', artifacts: [{ id: 'artifact', sha256 }] }] }
  return db.commitAssessment.create({
    data: {
      id: 'ci',
      repositoryId: 'repo',
      sourceSha: sha,
      selectionId: 's',
      requestKey: 'ci',
      inputHash: 'fixture',
      request,
      plan,
      report,
      assessmentHash: digest({ request, plan, report }),
    },
  })
}
it('reuses normalized rows across pagination/filter changes, refreshes ignores and report edits, and never caches access', async () => {
  const db = fixture.prisma
  await health()
  const reports = vi.spyOn(FindingsService.prototype as any, 'collectCandidates')
  try {
    const first = await service.list(session, { source: 'health', pageSize: '10' })
    expect(first.rows[0].title).toBe('Repeated code')
    await service.list(session, { source: 'health', q: 'code', page: '2', pageSize: '10' })
    expect(reports).toHaveBeenCalledTimes(1)
    await service.setIgnore(
      session,
      'f'.repeat(64),
      { origin: 'health', repository: '51', assessment: '00000000-0000-4000-8000-000000000001' },
      { state: 'IGNORED', reason: 'Intentional', expectedRevision: 0 },
    )
    const ignored = await service.list(session, { source: 'health', triage: 'IGNORED' })
    expect(ignored.rows[0].status).toBe('Ignored')
    expect(ignored.summary.reportedIssues).toBe(0)
    await db.repositoryHealthAssessment.update({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      data: { report: { completeness: 'COMPLETE', findings: [] } },
    })
    expect((await service.list(session, { source: 'health' })).rows).toEqual([])
    expect(reports).toHaveBeenCalledTimes(2)
    await db.organizationMembership.updateMany({ data: { active: false } })
    await expect(service.list(session, { source: 'health' })).rejects.toThrow()
  } finally {
    reports.mockRestore()
  }
})
it('invalidates artifact bytes, imported evidence and assessment integrity before returning a cached CI finding', async () => {
  const db = fixture.prisma,
    assessment = await ci()
  expect((await service.list(session, { source: 'ci' })).rows[0].title).toBe('Fixture test')
  await db.importedCiEvidence.update({
    where: { deliveryId: 'delivery' },
    data: { sourceSha: 'b'.repeat(40) },
  })
  await expect(service.list(session, { source: 'ci' })).rejects.toThrow('scope or integrity')
  await db.importedCiEvidence.update({
    where: { deliveryId: 'delivery' },
    data: { sourceSha: sha },
  })
  expect((await service.list(session, { source: 'ci' })).total).toBe(1)
  await db.ciArtifactImport.update({
    where: { id: 'artifact' },
    data: { content: Buffer.from('tampered') },
  })
  await expect(service.list(session, { source: 'ci' })).rejects.toThrow()
  await db.commitAssessment.update({
    where: { id: assessment.id },
    data: { report: { observations: [] } },
  })
  await expect(service.list(session, { source: 'ci' })).rejects.toThrow('integrity')
})
it('invalidates missing/removed artifacts and never reuses a projection after source ID deletion and recreation', async () => {
  const db = fixture.prisma
  await ci()
  expect((await service.list(session, { source: 'ci' })).total).toBe(1)
  const artifact = await db.ciArtifactImport.findUniqueOrThrow({ where: { id: 'artifact' } })
  await db.ciArtifactImport.delete({ where: { id: 'artifact' } })
  expect((await service.list(session, { source: 'ci' })).rows).toEqual([])
  await db.ciArtifactImport.create({ data: artifact })
  expect((await service.list(session, { source: 'ci' })).total).toBe(1)
  await health()
  expect((await service.list(session, { source: 'health' })).total).toBe(1)
  await db.repositoryHealthAssessment.delete({
    where: { id: '00000000-0000-4000-8000-000000000001' },
  })
  await health()
  await db.repositoryHealthAssessment.update({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    data: { report: { completeness: 'COMPLETE', findings: [] } },
  })
  expect((await service.list(session, { source: 'health' })).total).toBe(0)
})
it('invalidates advisory reviews when either their result or the bound assessment changes', async () => {
  const db = fixture.prisma,
    assessment = await ci()
  const context = {
    assessmentHash: assessment.assessmentHash,
    sourceSha: sha,
    evidence: [],
    source: {
      lines: [{ ref: 'diff:1', path: 'src/a.ts', line: 1, side: 'RIGHT', text: 'fixture' }],
    },
  }
  const snapshot = { context, checks: [{ id: 'review', title: 'Review' }] }
  await db.aiSkillReview.create({
    data: {
      id: 'ai',
      organizationId: 'org',
      repositoryId: 'repo',
      assessmentId: assessment.id,
      actorId: 'owner',
      stage: 'pull_request',
      state: 'SUCCEEDED',
      reservedMicroCents: 0n,
      snapshot,
      fingerprint: digest(snapshot),
      result: {
        context: { assessmentHash: context.assessmentHash, sourceSha: sha },
        findings: [
          {
            checkId: 'review',
            summary: 'Check retry handling',
            recommendation: 'Retain pending work.',
            evidenceRefs: ['diff:1'],
          },
        ],
      },
    },
  })
  expect((await service.list(session, { source: 'ai' })).total).toBe(1)
  await db.aiSkillReview.update({ where: { id: 'ai' }, data: { feedbackState: 'PUBLISHED' } })
  expect((await service.list(session, { source: 'ai' })).rows[0].feedbackState).toBe('PUBLISHED')
  await db.commitAssessment.update({ where: { id: 'ci' }, data: { assessmentHash: 'tampered' } })
  expect((await service.list(session, { source: 'ai' })).total).toBe(0)
})
it('shares concurrent cold normalization without sharing mutable triage rows', async () => {
  await health()
  const collect = vi.spyOn(FindingsService.prototype as any, 'collectCandidates')
  try {
    const [a, b] = await Promise.all([
      service.list(session, { source: 'health' }),
      service.list(session, { source: 'health' }),
    ])
    expect(collect).toHaveBeenCalledOnce()
    a.rows[0].title = 'Local mutation'
    expect(b.rows[0].title).toBe('Repeated code')
  } finally {
    collect.mockRestore()
  }
})
it('retries a dependency change between the revision read and parent lock instead of serving a stale cache', async () => {
  const db = fixture.prisma
  await ci()
  let armed = false
  const wrapper = new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key)
      return (read: any, options: any) =>
        target.$transaction(
          async (tx) =>
            read(
              new Proxy(tx, {
                get(reader, property) {
                  if (property !== '$queryRaw') return Reflect.get(reader, property)
                  return async (query: any) => {
                    const result = await reader.$queryRaw(query)
                    if (
                      armed &&
                      query.sql.includes('SELECT id,"findingReadRevision" FROM "CommitAssessment"')
                    ) {
                      armed = false
                      await db.ciArtifactImport.update({
                        where: { id: 'artifact' },
                        data: { content: Buffer.from('changed during read') },
                      })
                    }
                    return result
                  }
                },
              }),
            ),
          options,
        )
    },
  })
  const reader = new FindingsService(wrapper as any, new AuthorizationService(db), {} as any)
  expect((await reader.list(session, { source: 'ci' })).total).toBe(1)
  const collect = vi.spyOn(FindingsService.prototype as any, 'collectCandidates')
  try {
    armed = true
    await expect(reader.list(session, { source: 'ci' })).rejects.toThrow()
    expect(collect).toHaveBeenCalledOnce()
  } finally {
    collect.mockRestore()
  }
})
