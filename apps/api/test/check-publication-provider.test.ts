import { afterEach, expect, it, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
const payload = {
  name: 'Preflyt / Engineering Readiness',
  head_sha: 'a'.repeat(40),
  external_id: 'b'.repeat(64),
  status: 'completed' as const,
  conclusion: 'action_required' as const,
  output: { title: 'Needs verification', summary: 'Observe only' },
}
const run = () => ({
  ...payload,
  id: 12,
  app: { id: 999 },
  html_url: 'https://github.com/fixture/app/runs/12',
})
function setup() {
  vi.stubEnv('GITHUB_APP_ID', '999')
  const provider = new GitHubProviderService() as any
  vi.spyOn(provider, 'verifyInstallation').mockResolvedValue({
    permissions: { checks: 'write' },
  })
  vi.spyOn(provider, 'openRepository').mockResolvedValue({
    metadata: { owner: { login: 'fixture' }, name: 'app' },
  })
  const mint = vi
    .spyOn(provider, 'appRequest')
    .mockResolvedValue({ data: { token: 'fixture-token' } })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  return { provider, mint, fetch }
}
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })
it('mints only repository-scoped Checks write and verifies the created check with a GET', async () => {
  const { provider, mint, fetch } = setup()
  fetch
    .mockResolvedValueOnce(response({ check_runs: [] }))
    .mockResolvedValueOnce(response({ id: 12 }))
    .mockResolvedValueOnce(response(run()))
  expect(
    await provider.publishReadinessCheck(500n, 501n, payload),
  ).toMatchObject({ checkRunId: '12', appId: '999' })
  expect(mint).toHaveBeenCalledWith(
    'POST /app/installations/{installation_id}/access_tokens',
    {
      installation_id: 500,
      repository_ids: [501],
      permissions: { metadata: 'read', checks: 'write' },
    },
  )
  expect(fetch.mock.calls.map((c) => c[1].method)).toEqual([
    'GET',
    'POST',
    'GET',
  ])
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject(payload)
  provider.close()
})
it('recovers an existing exact App publication without another write', async () => {
  const { provider, fetch } = setup()
  fetch
    .mockResolvedValueOnce(response({ check_runs: [run()] }))
    .mockResolvedValueOnce(response(run()))
  await provider.publishReadinessCheck(500n, 501n, payload)
  expect(fetch.mock.calls.every((c) => c[1].method === 'GET')).toBe(true)
  provider.close()
})
it.each(['app', 'sha', 'conclusion', 'output'])(
  'rejects a mismatched %s in read-back evidence',
  async (field) => {
    const { provider, fetch } = setup()
    const changed: any = run()
    if (field === 'app') changed.app.id = 1000
    if (field === 'sha') changed.head_sha = 'c'.repeat(40)
    if (field === 'conclusion') changed.conclusion = 'success'
    if (field === 'output')
      changed.output = { title: 'Different', summary: 'Different' }
    fetch
      .mockResolvedValueOnce(response({ check_runs: [] }))
      .mockResolvedValueOnce(response({ id: 12 }))
      .mockResolvedValueOnce(response(changed))
    await expect(
      provider.publishReadinessCheck(500n, 501n, payload),
    ).rejects.toThrow('verification failed')
    provider.close()
  },
)
it('rejects passing payloads and missing Checks write before creating a check', async () => {
  const { provider, fetch } = setup()
  await expect(
    provider.publishReadinessCheck(500n, 501n, {
      ...payload,
      conclusion: 'success',
    }),
  ).rejects.toThrow('Unsupported')
  vi.mocked(provider.verifyInstallation).mockResolvedValue({
    permissions: { checks: 'read' },
  })
  await expect(
    provider.publishReadinessCheck(500n, 501n, payload),
  ).rejects.toThrow('Checks: write')
  expect(fetch).not.toHaveBeenCalled()
  provider.close()
})
it('never retries a timed-out POST automatically', async () => {
  const { provider, fetch } = setup()
  fetch
    .mockResolvedValueOnce(response({ check_runs: [] }))
    .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
  await expect(
    provider.publishReadinessCheck(500n, 501n, payload),
  ).rejects.toThrow('timeout')
  expect(fetch).toHaveBeenCalledTimes(2)
  provider.close()
})
it('rejects duplicate matching publications instead of creating another', async () => {
  const { provider, fetch } = setup()
  fetch.mockResolvedValueOnce(response({ check_runs: [run(), run()] }))
  await expect(
    provider.publishReadinessCheck(500n, 501n, payload),
  ).rejects.toThrow('Duplicate')
  expect(fetch).toHaveBeenCalledTimes(1)
  provider.close()
})

it('reads the current run using Actions read and checks repository identity', async () => {
  const { provider } = setup()
  const request = vi
    .fn()
    .mockResolvedValue({
      id: 42,
      repository: { id: 501 },
      head_repository: { id: 501 },
      run_attempt: 2,
      workflow_id: 77,
      head_sha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'success',
    })
  vi.mocked(provider.openRepository).mockResolvedValue({
    metadata: { owner: { login: 'fixture' }, name: 'app' },
    request,
  })
  expect(
    await provider.readReadinessWorkflowRun(500n, 501n, '42'),
  ).toMatchObject({
    sourceSha: 'a'.repeat(40),
    runAttempt: 2,
    workflowId: '77',
  })
  expect(provider.openRepository).toHaveBeenCalledWith(500n, 501n, 'actions')
  request.mockResolvedValue({
    id: 42,
    repository: { id: 501 },
    head_repository: { id: 999 },
    run_attempt: 2,
    workflow_id: 77,
    head_sha: 'a'.repeat(40),
  })
  await expect(
    provider.readReadinessWorkflowRun(500n, 501n, '42'),
  ).rejects.toThrow('identity')
  provider.close()
})
