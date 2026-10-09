import { once } from 'node:events'
import { createNativeController } from '../src/execution/native-controller.js'
import { nativeControllerCall } from '../src/execution/native-controller-client.js'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
vi.mock('../src/execution/native-docker-job.js', () => ({
  runNativeDockerCheck: vi.fn(),
  dockerCommand: vi.fn(async () => Buffer.from('')),
}))
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import {
  nativeAdapters,
  nativeToolReviews,
  buildNativePlan,
} from '../src/execution/native-plan.js'
import {
  readPinnedNativeSource,
  gitObjectHash,
} from '../src/execution/native-source.js'
import { nativeAdmission } from '../src/execution/native-admission.js'
import {
  NativeControllerJobs,
  type JobRecord,
} from '../src/execution/native-controller-jobs.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
import { verifyNativeReceipt } from '../src/execution/native-receipt.js'
import { digest } from '../src/assessments/assessment-digest.js'
const pair = generateKeyPairSync('ed25519')
const privateKey = pair.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString()
const publicKey = pair.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString()
let directory: string, jobs: NativeControllerJobs | undefined
const wait = async (fn: () => Promise<any>) => {
  for (let i = 0; i < 100; i++) {
    const value = await fn()
    if (value.state === 'COMPLETE') return value
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Job did not finish')
}
afterEach(async () => {
  await jobs?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  jobs = undefined
})
async function fixture(
  ruleId: 'tests.required' | 'secrets.scan' = 'tests.required',
) {
  directory = await mkdtemp(join(tmpdir(), 'preflyt-controller-contract-'))
  const now = Date.now(),
    adapter = nativeAdapters[ruleId]
  vi.stubEnv(
    'NATIVE_TOOL_REVIEWS',
    JSON.stringify([
      {
        ruleId,
        image: 'registry.example/test@sha256:' + 'b'.repeat(64),
        toolVersion: '1',
        license: adapter.license,
        configHash: 'c'.repeat(64),
        reviewDigest: 'd'.repeat(64),
        expiresAt: new Date(now + 3600000).toISOString(),
        databaseBuiltAt: null,
      },
    ]),
  )
  vi.stubEnv('NATIVE_CONTROLLER_SIGNING_KEY', privateKey)
  const tools = nativeToolReviews()!
  const approval = {
    controllerPublicKey: publicKey,
    organizationIds: ['org'],
    environmentId: 'fixture',
    controlsHash: 'e'.repeat(64),
    approvedAt: new Date(now - 60000).toISOString(),
    expiresAt: new Date(now + 3600000).toISOString(),
    toolReviewHash: tools.reviewHash,
  }
  vi.mocked(nativeRuntimeApproval).mockReturnValue({
    backend: 'docker',
    approval,
    approvalHash: 'f'.repeat(64),
  } as any)
  const content = Buffer.from('const fixture = true;\n'),
    blob = gitObjectHash('blob', content)
  const tree = gitObjectHash(
    'tree',
    Buffer.concat([
      Buffer.from('100644 fixture.js\0'),
      Buffer.from(blob, 'hex'),
    ]),
  )
  const source = await readPinnedNativeSource(
    async (path: string) =>
      path.includes('/commits/')
        ? { sha: 'a'.repeat(40), tree: { sha: tree } }
        : path.includes('/trees/')
          ? {
              sha: tree,
              truncated: false,
              tree: [
                {
                  path: 'fixture.js',
                  type: 'blob',
                  mode: '100644',
                  sha: blob,
                  size: content.length,
                },
              ],
            }
          : {
              sha: blob,
              size: content.length,
              encoding: 'base64',
              content: content.toString('base64'),
            },
    '/repos/fixture/test',
    '51',
    'a'.repeat(40),
  )
  const { planHash, ...plan } = buildNativePlan({
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: source.sourceSha,
    selectionId: 'selection',
    rules: [
      {
        id: ruleId,
        title: 'Fixture',
        required: true,
        capability: 'import_only',
      },
    ],
  })
  const expected = {
    requestId: randomUUID(),
    attemptId: randomUUID(),
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: source.sourceSha,
    sourceHash: source.sourceHash,
    selectionId: 'selection',
    planHash,
    plan,
    approvalHash: 'f'.repeat(64),
    ruleIds: [ruleId],
  }
  const runner = vi.fn(async (scope: any, id: any, path: string) => {
    expect(await readFile(join(path, 'fixture.js'), 'utf8')).toBe(
      content.toString(),
    )
    const report = Buffer.from(
      id === 'tests.required'
        ? '<testsuite tests="1" failures="0" errors="0" skipped="0"><testcase name="ok"/></testsuite>'
        : JSON.stringify({
            version: '2.1.0',
            runs: [{ tool: { driver: { name: 'fixture' } }, results: [] }],
          }),
    )
    return {
      ...scope,
      ...nativeCheckOutcome(id, 0, report),
      adapterId: adapter.id,
      image: tools.reviews[0].image,
      toolVersion: '1',
      configHash: tools.reviews[0].configHash,
      exitCode: 0,
      cleanupConfirmed: true,
      report: report.toString('base64'),
      jobId: 'fixture',
      attemptId: randomUUID(),
      approvalHash: expected.approvalHash,
      environmentId: 'fixture',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    }
  })
  jobs = new NativeControllerJobs(directory, runner as any)
  await jobs.initialize()
  return { expected, source, runner }
}
describe('durable native controller admission and signed results', () => {
  it('materializes verified source, executes once, redacts reports, signs the admission attempt and removes source', async () => {
    const { expected, source, runner } = await fixture()
    expect(await jobs!.call('admit', expected, source)).toEqual({
      state: 'PREPARING',
    })
    const result = await wait(() => jobs!.call('status', expected))
    const receipt = verifyNativeReceipt(result.signature, expected)!
    expect(receipt.attemptId).toBe(expected.attemptId)
    expect(receipt.checks[0]).toMatchObject({
      state: 'PASS',
      coverage: 'PARTIAL',
      cleanupConfirmed: true,
    })
    expect(receipt).not.toHaveProperty('source')
    expect(receipt.checks[0]).not.toHaveProperty('report')
    expect(
      (await readdir(join(directory, expected.attemptId))).filter((n) =>
        n.startsWith('preflyt-native-'),
      ),
    ).toEqual([])
    expect(await jobs!.call('admit', expected, source)).toEqual(result)
    expect(runner).toHaveBeenCalledOnce()
    await jobs!.close()
    jobs = new NativeControllerJobs(directory, runner as any)
    await jobs.initialize()
    expect(await jobs.call('status', expected)).toEqual(result)
    expect(runner).toHaveBeenCalledOnce()
  })
  it('blocks source/plan/scope changes before executing', async () => {
    const { expected, source, runner } = await fixture()
    for (const patch of [
      { sourceHash: '0'.repeat(64) },
      { repositoryId: '52' },
      { planHash: '0'.repeat(64) },
      { organizationId: 'another' },
      { ruleIds: ['arbitrary.command'] },
    ])
      await expect(
        jobs!.call('admit', { ...expected, ...patch }, source),
      ).rejects.toThrow()
    expect(runner).not.toHaveBeenCalled()
    const broken = {
      ...expected,
      plan: {
        ...expected.plan,
        steps: expected.plan.steps.map((s) => ({ ...s, args: ['/bin/sh'] })),
      },
    }
    broken.planHash = digest(broken.plan)
    expect(() => nativeAdmission(broken)).toThrow()
  })
  it('returns incomplete on runner failure with confirmed workspace cleanup', async () => {
    const { expected, source, runner } = await fixture()
    runner.mockRejectedValueOnce(new Error('private scanner detail'))
    await jobs!.call('admit', expected, source)
    const result = await wait(() => jobs!.call('status', expected)),
      receipt = verifyNativeReceipt(result.signature, expected)!
    expect(receipt.checks[0]).toMatchObject({
      state: 'INCOMPLETE',
      reason: 'EXECUTION_UNAVAILABLE',
      cleanupConfirmed: true,
    })
    expect(JSON.stringify(receipt)).not.toContain('private scanner detail')
  })
  it('cancels only the admitted scope and waits for cleanup before completing', async () => {
    const { expected, source, runner } = await fixture()
    runner.mockImplementationOnce(
      async (_s: any, _r: any, _p: any, signal: any) => {
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true }),
        )
        throw new Error('aborted')
      },
    )
    await jobs!.call('admit', expected, source)
    while (!runner.mock.calls.length) await new Promise((r) => setTimeout(r, 5))
    await expect(
      jobs!.call('cancel', { ...expected, organizationId: 'another' }),
    ).rejects.toThrow()
    expect((await jobs!.call('cancel', expected)).state).toBe('RUNNING')
    const result = await wait(() => jobs!.call('status', expected)),
      receipt = verifyNativeReceipt(result.signature, expected)!
    expect(receipt.cancelled).toBe(true)
    expect(
      receipt.checks.every(
        (c) => c.state === 'INCOMPLETE' && c.cleanupConfirmed,
      ),
    ).toBe(true)
  })
  it('never reruns interrupted source after a controller restart', async () => {
    const { expected, runner } = await fixture()
    await jobs!.close()
    await mkdir(join(directory, expected.attemptId), { mode: 0o700 })
    const record: JobRecord = {
      expected,
      scopeHash: digest(expected),
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
      workspaceRoot: null,
    }
    await writeFile(
      join(directory, expected.attemptId, 'state.json'),
      JSON.stringify(record),
      { mode: 0o600 },
    )
    jobs = new NativeControllerJobs(directory, runner as any)
    await jobs.initialize()
    const result = await jobs.call('status', expected),
      receipt = verifyNativeReceipt(result.signature!, expected)!
    expect(receipt.cancelled).toBe(true)
    expect(receipt.checks[0].reason).toBe('CONTROLLER_RESTARTED')
    expect(runner).not.toHaveBeenCalled()
  })
})

it('serves authenticated admission/status over the real controller HTTP protocol and rejects other scopes', async () => {
  const { expected, source, runner } = await fixture('secrets.scan')
  const reviewed = nativeRuntimeApproval()!
  vi.stubEnv('NATIVE_CONTROLLER_API_KEY', 'x'.repeat(32))
  const server = createNativeController(
    undefined,
    {
      review: () => reviewed,
      observe: async () => ({
        verified: true,
        failed: [],
        controlsHash: reviewed.approval.controlsHash,
      }),
    },
    jobs,
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = 'http://127.0.0.1:' + (server.address() as any).port
  reviewed.approval.controllerOrigin = origin
  try {
    const denied = await fetch(origin + '/jobs/admit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected, source }),
    })
    expect(denied.status).toBe(401)
    expect(runner).not.toHaveBeenCalled()
    expect((await nativeControllerCall('admit', expected, source)).state).toBe(
      'PREPARING',
    )
    const result = await wait(() => nativeControllerCall('status', expected))
    expect(
      verifyNativeReceipt(result.signature, expected)?.checks[0],
    ).toMatchObject({ state: 'PASS', coverage: 'FULL_RULE' })
    await expect(
      nativeControllerCall('status', {
        ...expected,
        organizationId: 'another',
      }),
    ).rejects.toThrow()
    const preflight = await fetch(origin + '/preflight', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + 'x'.repeat(32),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nonce: randomUUID(),
        organizationId: 'org',
        repositoryId: '51',
        approvalHash: expected.approvalHash,
      }),
    })
    const proof = await preflight.json()
    expect(proof.signature).toBeTypeOf('string')
  } finally {
    server.close()
    server.closeAllConnections()
    await once(server, 'close')
  }
})
it('cleans interrupted work after review expiration without signing an invalid result', async () => {
  const { expected, runner } = await fixture()
  await jobs!.close()
  await mkdir(join(directory, expected.attemptId), { mode: 0o700 })
  await writeFile(
    join(directory, expected.attemptId, 'state.json'),
    JSON.stringify({
      expected,
      scopeHash: digest(expected),
      state: 'RUNNING',
      startedAt: new Date().toISOString(),
      workspaceRoot: null,
    }),
    { mode: 0o600 },
  )
  vi.mocked(nativeRuntimeApproval).mockReturnValue(null)
  jobs = new NativeControllerJobs(directory, runner as any)
  await jobs.initialize()
  expect(await jobs.call('status', expected)).toEqual({ state: 'COMPLETE' })
  expect(runner).not.toHaveBeenCalled()
})

it('serializes simultaneous admissions and preserves cleanup failures as incomplete', async () => {
  const { expected, source, runner } = await fixture()
  runner.mockImplementationOnce(async (scope: any, id: any) => ({
    ...scope,
    ruleId: id,
    state: 'INCOMPLETE',
    reason: 'CLEANUP_UNCONFIRMED',
    reportHash: null,
    summary: null,
    adapterId: nativeAdapters[id as keyof typeof nativeAdapters].id,
    image: nativeToolReviews()!.reviews[0].image,
    toolVersion: '1',
    configHash: 'c'.repeat(64),
    exitCode: null,
    cleanupConfirmed: false,
  }))
  const other = {
    ...expected,
    requestId: randomUUID(),
    attemptId: randomUUID(),
  }
  const values = await Promise.allSettled([
    jobs!.call('admit', expected, source),
    jobs!.call('admit', other, source),
  ])
  expect(values.map((v) => v.status)).toEqual(['fulfilled', 'rejected'])
  expect(runner).not.toHaveBeenCalledTimes(2)
  const completed = await wait(() => jobs!.call('status', expected))
  expect(
    verifyNativeReceipt(completed.signature, expected)?.checks[0],
  ).toMatchObject({ state: 'INCOMPLETE', cleanupConfirmed: false })
  await jobs!.close()
  jobs = new NativeControllerJobs(directory, runner as any)
  await jobs.initialize()
  expect(await jobs.call('status', expected)).toEqual(completed)
  expect(runner).toHaveBeenCalledOnce()
})
