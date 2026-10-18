import 'reflect-metadata'
import { expect, it, vi } from 'vitest'
import { ContributorsService } from '../src/contributors/contributors.service.js'
const repo = { id: 'repo', githubId: 51n, installationId: 1n, fullName: 'fixture/app' }
function fixture(numbers: (number | null)[], assessments: any[]) {
  const observations = numbers.map((number, i) => ({
    id: String(i),
    repositoryId: 'repo',
    contributorId: 'person',
    sourceSha: 'a'.repeat(40),
    sourceObjectId: String(i),
    pullRequestNumber: number,
    relationship: 'PR_AUTHOR',
    merged: false,
    observedAt: new Date(),
    contributor: { id: 'person', githubUserId: '12', login: 'fixture-person', kind: 'HUMAN' },
  }))
  const db: any = {
    contributorObservation: { findMany: vi.fn().mockResolvedValue(observations) },
    commitAssessment: { findMany: vi.fn().mockResolvedValue(assessments) },
    contributorDelivery: { findFirst: vi.fn().mockResolvedValue(null) },
    auditEvent: { create: vi.fn() },
    contributorSyncState: { findMany: vi.fn().mockResolvedValue([]) },
  }
  const access: any = {
    requireOrganization: vi.fn(),
    membership: vi.fn().mockResolvedValue({ role: 'OWNER' }),
    repositoryScope: vi.fn().mockResolvedValue([repo]),
  }
  return new ContributorsService(db, access, {} as any)
}
const session = { identityId: 'owner', organizationId: 'org', role: 'OWNER' } as any
it('associates thousands of PR observations without rescanning all assessments per PR', async () => {
  let reads = 0
  const numbers = Array.from({ length: 5000 }, (_, i) => i + 1)
  const assessments = numbers.map((number) => ({
    repositoryId: 'repo',
    get sourceSha() {
      reads++
      return 'a'.repeat(40)
    },
    request: { pullRequest: { number } },
  }))
  const result = await fixture(numbers, assessments).read(session, {})
  expect(result.assessmentActivity).toEqual([
    { name: 'Snapshot recorded', count: 5000 },
    { name: 'No matching snapshot', count: 0 },
  ])
  expect(reads).toBeLessThan(10000)
})
it('keeps repository, commit and PR-number bindings exact, including legacy null versus missing numbers', async () => {
  for (const patch of [
    { repositoryId: 'other' },
    { sourceSha: 'b'.repeat(40) },
    { request: { pullRequest: { number: 2 } } },
    { request: { pullRequest: { number: '1' } } },
  ]) {
    const result = await fixture(
      [1],
      [
        {
          repositoryId: 'repo',
          sourceSha: 'a'.repeat(40),
          request: { pullRequest: { number: 1 } },
          ...patch,
        },
      ],
    ).read(session, {})
    expect(result.assessmentActivity[0].count).toBe(0)
  }
  const result = await fixture(
    [null],
    [{ repositoryId: 'repo', sourceSha: 'a'.repeat(40), request: {} }],
  ).read(session, {})
  expect(result.assessmentActivity[0].count).toBe(0)
})
