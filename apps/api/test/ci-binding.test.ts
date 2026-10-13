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
it('retains verified collection reports after the terminal gate fails without borrowing older attempts or cancelled runs', () => {
  const collected = { deliveryId:'jobs', sourceObjectId:'10', sourceStatus:'completed', sourceConclusion:'success',
    sourceIdentity:{kind:'workflow_run', workflowId:'7',runAttempt:1,verificationScope:'jobs'},
    sourceUpdatedAt:new Date('2026-10-13T10:00:00Z'),observedAt:new Date('2026-10-13T10:00:00Z') }
  const failed = {...collected,deliveryId:'event',sourceConclusion:'failure',
    sourceIdentity:{kind:'workflow_run',workflowId:'7',runAttempt:1},
    sourceUpdatedAt:new Date('2026-10-13T10:01:00Z')}
  const reports = new Map([['tests.required', new Set(['jobs'])]])
  expect(resolveBindings([binding],[collected,failed],reports).mappings[0].deliveryId).toBe('jobs')
  expect(resolveBindings([binding],[collected,failed]).mappings[0].deliveryId).toBe('event')
  expect(resolveBindings([binding],[collected,{...failed,sourceConclusion:'cancelled'}],reports).mappings[0].deliveryId).toBe('event')
  expect(resolveBindings([binding],[collected,{...failed,sourceIdentity:{...failed.sourceIdentity,runAttempt:2}}],reports).mappings[0].deliveryId).toBe('event')
})
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

const verifiedJobReport = {
  deliveryId: 'verified-jobs',
  sourceObjectId: '10',
  sourceIdentity: { kind: 'workflow_run', workflowId: '7', runAttempt: 3 },
  sourceStatus: 'completed',
  sourceConclusion: 'success',
  sourceUpdatedAt: new Date('2026-10-12T20:56:00Z'),
  observedAt: new Date('2026-10-12T20:56:00Z'),
}
const completion = {
  ...verifiedJobReport,
  deliveryId: 'workflow-completed',
  sourceUpdatedAt: new Date('2026-10-12T20:57:00Z'),
  observedAt: new Date('2026-10-12T20:57:00Z'),
}
const verifiedReports = new Map([['tests.required', new Set(['verified-jobs'])]])
it('keeps a verified report when the same run attempt later completes successfully', () => {
  expect(resolveBindings([binding], [completion, verifiedJobReport], verifiedReports).mappings[0].deliveryId)
    .toBe('verified-jobs')
  expect(resolveBindings([binding], [completion, verifiedJobReport]).mappings[0].deliveryId)
    .toBe('workflow-completed')
  expect(resolveBindings([{...binding, ruleId:'build.required'}], [completion, verifiedJobReport], verifiedReports).mappings[0].deliveryId)
    .toBe('workflow-completed')
})
it.each([
  ['completed', 'failure'],
  ['completed', 'cancelled'],
  ['in_progress', null],
  ['completed', null],
])('does not hide a later %s/%s result behind a verified successful report', (sourceStatus, sourceConclusion) => {
  expect(resolveBindings([binding], [{...completion, sourceStatus, sourceConclusion}, verifiedJobReport], verifiedReports).mappings[0].deliveryId)
    .toBe('workflow-completed')
})
it('does not reuse verified reports from an older attempt or ambiguous workflow runs', () => {
  const newerAttempt={...completion, sourceIdentity:{...completion.sourceIdentity,runAttempt:4}}
  expect(resolveBindings([binding], [newerAttempt, verifiedJobReport], verifiedReports).mappings[0].deliveryId)
    .toBe('workflow-completed')
  expect(resolveBindings([binding], [{...completion,sourceObjectId:'other-run'}, verifiedJobReport], verifiedReports).ambiguousRules)
    .toEqual(['tests.required'])
})
