import { expect, it } from 'vitest'
import {
  attentionReason,
  profileTechnologies,
} from '../src/dashboard/dashboard-summary.js'
const now = new Date('2026-10-09T12:00:00Z')
const repo = {
  githubId: 502n,
  installationId: 501n,
  installation: { accessRevision: 2 },
  standards: [{ id: 'selection' }],
}
const context = {
  version: 1,
  state: 'open',
  merged: false,
  draft: false,
  head: { repositoryId: '502', ref: 'feature', sha: 'a'.repeat(40) },
  base: { repositoryId: '502', ref: 'main', sha: 'b'.repeat(40) },
}
const row = {
  context,
  syncState: 'SYNCED',
  verifiedAt: now,
  verifiedInstallationId: '501',
  verifiedAccessRevision: 2,
}
it('rejects stale, future or wrong-installation PR confirmations', () => {
  for (const change of [
    { verifiedAt: new Date(now.getTime() - 300000) },
    { verifiedAt: new Date(now.getTime() + 1000) },
    { verifiedInstallationId: '999' },
    { verifiedAccessRevision: 1 },
  ])
    expect(attentionReason({ ...row, ...change }, repo, now)).toBe(
      'AWAITING_SYNC',
    )
  expect(attentionReason(row, repo, now)).toBe('EXECUTION_NOT_VERIFIED')
})
it('preserves missing, closed and unsupported fork states', () => {
  expect(attentionReason({ ...row, context: {} }, repo, now)).toBe(
    'CONTEXT_UNAVAILABLE',
  )
  expect(
    attentionReason(
      { ...row, context: { ...context, state: 'closed' } },
      repo,
      now,
    ),
  ).toBe('CLOSED')
  expect(
    attentionReason(
      {
        ...row,
        context: { ...context, head: { ...context.head, repositoryId: '999' } },
      },
      repo,
      now,
    ),
  ).toBe('FORK_HEAD_UNSUPPORTED')
})
it('projects bounded technology observations and excludes other profile text', () => {
  expect(
    profileTechnologies({
      signals: [
        { id: 'languages', observations: ['TypeScript', 123, 'x'.repeat(100)] },
        { id: 'frameworks', observations: ['NestJS'] },
        { id: 'secrets', observations: ['private evidence'] },
      ],
    }),
  ).toEqual(['TypeScript', 'NestJS'])
  expect(profileTechnologies(null)).toEqual([])
})
