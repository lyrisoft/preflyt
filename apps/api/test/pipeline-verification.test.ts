import { expect, it, vi } from 'vitest'
import {
  githubReportExecutions,
  pipelineVerifications,
  verifiedPipelineReports,
} from '../src/assessments/pipeline-verification.js'
const observation = {
  sourceKind: 'workflow_run',
  sourceConclusion: 'success',
  sourceStatus: 'completed',
  sourceSha: 'a'.repeat(40),
  sourceObjectId: '1',
  sourceIdentity: { kind: 'workflow_run', runAttempt: 1, workflowId: '2' },
}
const receipt = {
  schemaVersion: 1,
  submissionId: 'receipt',
  repositoryId: 'repo',
  selectionId: 'selection',
  sourceSha: observation.sourceSha,
  runId: '1',
  runAttempt: 1,
  workflowId: '2',
  reports: [{ ruleId: 'tests.required', sha256: 'hash' }],
  jobIds: ['3'],
}
it('prefers only attached reports bound to the server-verified workflow and attempt', () => {
  const jobs={...observation,deliveryId:'jobs',sourceKind:'workflow_jobs',
    sourceIdentity:{...observation.sourceIdentity,jobIds:['3'],verificationScope:'jobs'},
    artifacts:[{sha256:'hash'}]}
  const proof={...receipt,verificationScope:'jobs'}
  const selected=verifiedPipelineReports([proof],[jobs])
  expect([...selected.get('tests.required')!]).toEqual(['jobs'])
  expect(verifiedPipelineReports([], [jobs]).size).toBe(0)
  for(const rejected of [
    {...jobs,artifacts:[{sha256:'other'}]},
    {...jobs,sourceSha:'b'.repeat(40)},
    {...jobs,sourceObjectId:'other'},
    {...jobs,sourceConclusion:'failure'},
    {...jobs,sourceIdentity:{...jobs.sourceIdentity,runAttempt:2}},
    {...jobs,sourceIdentity:{...jobs.sourceIdentity,workflowId:'other'}},
    {...jobs,sourceIdentity:{...jobs.sourceIdentity,jobIds:['other']}},
  ]) expect(verifiedPipelineReports([proof],[rejected]).size).toBe(0)
})
it('links exact submitted report bytes, rule and run attempt, excluding other and manual reports', () => {
  expect(githubReportExecutions([receipt], observation, 'hash')).toMatchObject([
    { ruleId: 'tests.required', runId: '1' },
  ])
  expect(githubReportExecutions([receipt], observation, 'other')).toEqual([])
  expect(
    githubReportExecutions(
      [receipt],
      {
        ...observation,
        sourceIdentity: {
          kind: 'workflow_run',
          runAttempt: 2,
          workflowId: '2',
        },
      },
      'hash',
    ),
  ).toEqual([])
  expect(
    githubReportExecutions(
      [receipt],
      { ...observation, sourceConclusion: 'failure' },
      'hash',
    ),
  ).toEqual([])
  expect(
    githubReportExecutions(
      [receipt],
      { ...observation, sourceKind: 'check_run' },
      'hash',
    ),
  ).toEqual([])
})
it('loads only the server-created receipt at the same repository, commit and selection', async () => {
  const findMany = vi
    .fn()
    .mockResolvedValue([
      { metadata: receipt },
      { metadata: { ...receipt, sourceSha: 'b'.repeat(40) } },
    ])
  expect(
    await pipelineVerifications(
      { auditEvent: { findMany } },
      'repo',
      observation.sourceSha,
      'selection',
    ),
  ).toEqual([receipt])
  expect(findMany.mock.calls[0][0].where.AND).toHaveLength(3)
  findMany.mockResolvedValue(
    Array.from({ length: 101 }, () => ({ metadata: receipt })),
  )
  expect(
    await pipelineVerifications(
      { auditEvent: { findMany } },
      'repo',
      observation.sourceSha,
      'selection',
    ),
  ).toEqual([])
})
