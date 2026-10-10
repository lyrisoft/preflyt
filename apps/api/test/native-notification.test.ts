import { afterEach, expect, it, vi } from 'vitest'
import {
  assessmentNotification,
  nativeExecutionFailureId,
  recordAssessmentNotification,
  recordNativeExecutionFailure,
} from '../src/notifications/notification-event.js'

afterEach(() => vi.unstubAllEnvs())
const request = {
  id: 'request',
  controllerJobId: 'attempt',
  organizationId: 'org',
  repositoryId: 'db-repo',
  repositoryGithubId: '51',
  sourceSha: 'a'.repeat(40),
  actorId: 'owner',
}
function fixture() {
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  const repo = {
    id: 'db-repo',
    githubId: 51n,
    fullName: 'fixture/repo',
    installationId: 7n,
  }
  const tx: any = {
    gitHubRepository: { findFirst: vi.fn(async () => repo) },
    gitHubInstallation: {
      findUniqueOrThrow: vi.fn(async () => ({ organizationId: 'org' })),
    },
    notificationEvent: {
      createMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  }
  return { repo, tx }
}
it('classifies verified native FAIL as assessment failure without relying on imported CI', () => {
  expect(
    assessmentNotification({
      coverage: 'INCOMPLETE',
      checks: [
        {
          evidenceSource: 'NATIVE',
          nativeOutcome: 'FAIL',
          providerResult: null,
        },
      ],
    }),
  ).toEqual({ type: 'ASSESSMENT_FAILED', severity: 'error' })
  expect(
    assessmentNotification({
      coverage: 'INCOMPLETE',
      checks: [{ nativeOutcome: 'FAIL' }],
    }).type,
  ).toBe('ASSESSMENT_INCOMPLETE')
  expect(
    assessmentNotification({
      coverage: 'INCOMPLETE',
      checks: [{ evidenceSource: 'NATIVE', nativeOutcome: 'INCOMPLETE' }],
    }).type,
  ).toBe('ASSESSMENT_INCOMPLETE')
})
it('creates redacted failure events only in the active repository organization', async () => {
  const { tx } = fixture()
  await recordNativeExecutionFailure(tx, request)
  expect(tx.gitHubRepository.findFirst).toHaveBeenCalledWith({
    where: {
      id: 'db-repo',
      githubId: 51n,
      selected: true,
      available: true,
      installation: { active: true, organizationId: 'org' },
    },
  })
  expect(tx.notificationEvent.createMany).toHaveBeenCalledWith({
    data: [
      {
        id: nativeExecutionFailureId('request', 'attempt'),
        organizationId: 'org',
        repositoryId: 'db-repo',
        repositoryGithubId: '51',
        repositoryName: 'fixture/repo',
        sourceSha: 'a'.repeat(40),
        actorId: 'owner',
        type: 'NATIVE_EXECUTION_FAILED',
        severity: 'error',
      },
    ],
    skipDuplicates: true,
  })
})
it('does not create failure notices for unavailable or foreign repositories', async () => {
  const { tx } = fixture()
  tx.gitHubRepository.findFirst.mockResolvedValue(null)
  await recordNativeExecutionFailure(tx, request)
  expect(tx.notificationEvent.createMany).not.toHaveBeenCalled()
})
it('retains deployment opt-out and requires an admitted attempt ID', async () => {
  const { tx } = fixture()
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'false')
  await recordNativeExecutionFailure(tx, request)
  expect(tx.gitHubRepository.findFirst).not.toHaveBeenCalled()
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true')
  await recordNativeExecutionFailure(tx, { ...request, controllerJobId: null })
  expect(tx.gitHubRepository.findFirst).not.toHaveBeenCalled()
})
it('reuses the current attempt alert when its immutable assessment is saved', async () => {
  const { tx, repo } = fixture()
  tx.notificationEvent.findFirst.mockResolvedValue({ id: 'existing' })
  await recordAssessmentNotification(
    tx,
    {
      id: 'assessment',
      request: { trigger: 'NATIVE' },
      requestKey: 'native:request',
      sourceSha: request.sourceSha,
      report: {
        coverage: 'INCOMPLETE',
        checks: [{ evidenceSource: 'NATIVE', nativeOutcome: 'FAIL' }],
        nativeExecutions: [{ id: 'request', controllerJobId: 'attempt' }],
      },
    },
    repo,
    'owner',
  )
  expect(tx.notificationEvent.findFirst).toHaveBeenCalledWith({
    where: {
      id: { in: [nativeExecutionFailureId('request', 'attempt')] },
      type: 'NATIVE_EXECUTION_FAILED',
      organizationId: 'org',
      repositoryId: 'db-repo',
      sourceSha: request.sourceSha,
    },
  })
  expect(tx.notificationEvent.create).not.toHaveBeenCalled()
})
it('does not suppress a failure assessment when no matching native attempt alert exists', async () => {
  const { tx, repo } = fixture()
  tx.notificationEvent.findFirst.mockResolvedValue(null)
  await recordAssessmentNotification(
    tx,
    {
      id: 'assessment',
      request: { trigger: 'NATIVE' },
      requestKey: 'native:request',
      sourceSha: request.sourceSha,
      report: {
        coverage: 'INCOMPLETE',
        checks: [{ evidenceSource: 'NATIVE', nativeOutcome: 'FAIL' }],
        nativeExecutions: [{ id: 'request', controllerJobId: 'attempt' }],
      },
    },
    repo,
    'owner',
  )
  expect(tx.notificationEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: 'ASSESSMENT_FAILED',
      severity: 'error',
    }),
  })
})

it('does not suppress a new imported assessment alert because of an earlier native attempt', async () => {
  const { tx, repo } = fixture()
  tx.notificationEvent.findFirst.mockResolvedValue({
    id: 'existing-native-failure',
  })
  await recordAssessmentNotification(
    tx,
    {
      id: 'assessment',
      request: { trigger: 'GITHUB_CI' },
      requestKey: 'github:delivery',
      sourceSha: request.sourceSha,
      report: {
        coverage: 'INCOMPLETE',
        checks: [{ providerResult: 'FAILED' }],
        nativeExecutions: [{ id: 'request', controllerJobId: 'attempt' }],
      },
    },
    repo,
    'owner',
  )
  expect(tx.notificationEvent.findFirst).not.toHaveBeenCalled()
  expect(tx.notificationEvent.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ type: 'ASSESSMENT_FAILED' }),
  })
})
