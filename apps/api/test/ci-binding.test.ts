import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { normalizeGitHubEvent } from '../src/github-events/github-event.js'
import { importCiEvidence } from '../src/github-events/ci-evidence.js'
import { resolveBindings } from '../src/assessments/ci-binding.js'
const binding = {
  ruleId: 'tests.required',
  kind: 'workflow_run' as const,
  workflowId: '7',
}
const payload = (kind: string, extra: object = {}) => ({
  action: 'completed',
  installation: { id: 1 },
  repository: { id: 2 },
  [kind]: {
    id: 3,
    head_sha: 'a'.repeat(40),
    status: 'completed',
    conclusion: 'success',
    ...extra,
  },
})
it('normalizes only stable source identifiers from signed provider data', () => {
  const event = normalizeGitHubEvent(
    'check_run',
    payload('check_run', {
      app: { id: 5, name: 'secret' },
      name: 'Unit Tests',
      html_url: 'secret',
    }),
  )!
  expect(event.sourceIdentity).toEqual({
    kind: 'check_run',
    appId: '5',
    checkName: 'Unit Tests',
  })
  expect(
    JSON.stringify(event, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ).not.toContain('secret')
  expect(
    normalizeGitHubEvent(
      'workflow_run',
      payload('workflow_run', { workflow_id: 7, run_attempt: 2 }),
    )!.sourceIdentity,
  ).toEqual({ kind: 'workflow_run', workflowId: '7', runAttempt: 2 })
  expect(() =>
    normalizeGitHubEvent(
      'check_run',
      payload('check_run', { app: { id: 5 }, name: 'bad\nname' }),
    ),
  ).toThrow()
  expect(() =>
    normalizeGitHubEvent(
      'workflow_run',
      payload('workflow_run', { workflow_id: 7, run_attempt: 0 }),
    ),
  ).toThrow()
})
it('keeps historical v1 hashes unchanged and hashes identity for v2', () => {
  const d = {
    ...normalizeGitHubEvent('check_run', payload('check_run'))!,
    id: 'delivery',
    payloadHash: 'f'.repeat(64),
    receivedAt: new Date('2026-10-08T00:00:00Z'),
    sourceIdentity: null,
  }
  const old = importCiEvidence(d as any)!
  expect(old.version).toBe(1)
  expect(old).not.toHaveProperty('sourceIdentity')
  const { evidenceHash, ...projection } = old
  const legacy = {
    ...projection,
    repositoryGithubId: '2',
    installationId: '1',
    sourceUpdatedAt: null,
    observedAt: d.receivedAt.toISOString(),
  }
  expect(evidenceHash).toBe(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
  )
  const next = importCiEvidence({
    ...d,
    sourceIdentity: { kind: 'check_run', appId: '5', checkName: 'tests' },
  } as any)!
  expect(next.version).toBe(2)
  expect(next.evidenceHash).not.toBe(evidenceHash)
})
it('chooses the newest workflow attempt regardless of delivery order and timestamps', () => {
  const rows = [1, 2].map((n) => ({
    deliveryId: 'd' + n,
    sourceObjectId: '10',
    sourceIdentity: { kind: 'workflow_run', workflowId: '7', runAttempt: n },
    sourceUpdatedAt: new Date(n === 1 ? '2026-10-09' : '2026-10-08'),
    observedAt: new Date(),
  }))
  expect(resolveBindings([binding], rows).mappings[0].deliveryId).toBe('d2')
  expect(
    resolveBindings(
      [binding],
      rows.map((r, i) => ({ ...r, sourceObjectId: String(i) })),
    ).ambiguousRules,
  ).toEqual(['tests.required'])
  expect(
    resolveBindings(
      [binding],
      rows.map((r) => ({
        ...r,
        sourceIdentity: { kind: 'workflow_run', workflowId: '7' },
      })),
    ).ambiguousRules,
  ).toEqual(['tests.required'])
})
