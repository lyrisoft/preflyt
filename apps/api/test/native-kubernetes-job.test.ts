import { randomUUID, createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }))
vi.mock('../src/execution/native-runtime.js', () => ({
  nativeRuntimeApproval: vi.fn(),
}))
vi.mock('../src/execution/native-controls.js', () => ({
  checkNativeControls: vi.fn(() => ({ verified: true })),
}))
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import { checkNativeControls } from '../src/execution/native-controls.js'
import {
  runNativeKubernetesCheck,
  cleanupNativeKubernetesJob,
} from '../src/execution/native-kubernetes-job.js'
import { nativeRunnerReport } from '../src/execution/native-runner-report.js'
import { nativeKubernetesResources } from '../src/execution/native-kubernetes-contract.js'
import { gitObjectHash } from '../src/execution/native-source.js'
import { digest } from '../src/assessments/assessment-digest.js'
const clone = (v: any) => structuredClone(v)
beforeEach(() =>
  vi.mocked(checkNativeControls).mockReturnValue({
    verified: true,
    failed: [],
    controlsHash: 'e'.repeat(64),
  }),
)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
function fixture(
  options: {
    fail?: boolean
    mutation?: (pod: any) => void
    cleanupError?: boolean
    wrongHash?: boolean
    crashCreate?: boolean
  } = {},
) {
  const bytes = Buffer.from('const fixture = true;\n'),
    blob = gitObjectHash('blob', bytes)
  const treeSha = gitObjectHash(
    'tree',
    Buffer.concat([Buffer.from('100644 app.js\0'), Buffer.from(blob, 'hex')]),
  )
  const file = {
    path: 'app.js',
    mode: '100644',
    blobSha: blob,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  const manifest = {
    version: 1,
    repositoryId: '51',
    sourceSha: 'a'.repeat(40),
    treeSha,
    tree: [
      {
        path: file.path,
        mode: file.mode,
        type: 'blob',
        sha: blob,
        size: bytes.length,
      },
    ],
    files: [file],
    totalBytes: bytes.length,
  }
  const source = {
    ...manifest,
    files: [{ ...file, content: bytes.toString('base64') }],
    sourceHash: digest(manifest),
  }
  const scope = {
    requestId: randomUUID(),
    organizationId: 'org',
    repositoryId: '51',
    sourceSha: source.sourceSha,
    sourceHash: source.sourceHash,
    planHash: 'b'.repeat(64),
  }
  const tool = {
    ruleId: 'secrets.scan' as const,
    image: 'registry.example/scan@sha256:' + 'c'.repeat(64),
    toolVersion: '1',
    license: 'MIT',
    configHash: 'd'.repeat(64),
    reviewDigest: 'e'.repeat(64),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    databaseBuiltAt: null,
  }
  vi.stubEnv('NATIVE_TOOL_REVIEWS', JSON.stringify([tool]))
  const approval = {
    organizationIds: ['org'],
    namespace: 'reviewed',
    runtimeClass: 'runsc',
    serviceAccount: 'sandbox',
    environmentId: 'fixture',
    controlsHash: 'e'.repeat(64),
  } as any
  vi.mocked(nativeRuntimeApproval).mockReturnValue({
    backend: 'kubernetes',
    approval,
    approvalHash: 'f'.repeat(64),
  } as any)
  const resources = nativeKubernetesResources(
    scope,
    tool.ruleId,
    tool,
    approval,
    source,
  )
  let config: any = null,
    job: any = null,
    pod: any = null
  const client = {
    json: vi.fn(async (method: string, path: string, body?: any) => {
      if (method === 'POST' && path.endsWith('/configmaps')) {
        config = {
          ...clone(body),
          metadata: { ...body.metadata, uid: randomUUID() },
        }
        return clone(config)
      }
      if (method === 'POST' && path.endsWith('/jobs')) {
        job = {
          ...clone(body),
          metadata: { ...body.metadata, uid: randomUUID() },
        }
        pod = {
          metadata: {
            name: resources.name + '-abcde',
            namespace: approval.namespace,
            uid: randomUUID(),
            resourceVersion: '1',
            annotations: body.metadata.annotations,
            labels: body.metadata.labels,
            ownerReferences: [
              {
                uid: job.metadata.uid,
                controller: true,
                kind: 'Job',
                name: resources.name,
                apiVersion: 'batch/v1',
              },
            ],
          },
          spec: clone(body.spec.template.spec),
          status: { phase: 'Pending' },
        }
        options.mutation?.(pod)
        if (options.crashCreate) throw new Error('Unknown write outcome')
        return clone(job)
      }
      if (method === 'PATCH') {
        expect(pod.spec.schedulingGates).toHaveLength(1)
        expect(body.metadata.resourceVersion).toBe('1')
        expect(body.metadata.uid).toBe(pod.metadata.uid)
        pod.spec.schedulingGates = []
        pod.status = {
          phase: 'Succeeded',
          initContainerStatuses: [
            { name: 'source', state: { terminated: { exitCode: 0 } } },
          ],
          containerStatuses: [
            {
              name: 'check',
              state: { terminated: { exitCode: options.fail ? 1 : 0 } },
            },
          ],
        }
        return clone(pod)
      }
      if (method === 'DELETE') {
        if (path.includes('/jobs/')) {
          if (options.cleanupError) throw new Error('Cleanup unavailable')
          expect(body.preconditions.uid).toBe(job.metadata.uid)
          job = null
          pod = null
        } else {
          expect(body.preconditions.uid).toBe(config.metadata.uid)
          config = null
        }
        return {}
      }
      if (path.includes('/pods?')) return { items: pod ? [clone(pod)] : [] }
      if (path.includes('/jobs/')) return clone(job)
      if (path.includes('/configmaps/')) return clone(config)
      throw new Error('Unexpected request')
    }),
    logs: vi.fn(async () =>
      Buffer.from(
        JSON.stringify({
          version: 2,
          sourceHash: options.wrongHash ? '0'.repeat(64) : scope.sourceHash,
          exitCode: options.fail ? 1 : 0,
          report: Buffer.from(
            JSON.stringify({
              version: '2.1.0',
              runs: [
                {
                  tool: { driver: { name: 'fixture' } },
                  results: options.fail
                    ? [{ message: { text: 'seeded' } }]
                    : [],
                },
              ],
            }),
          ).toString('base64'),
        }),
      ),
    ),
  }
  const run = (signal?: AbortSignal) =>
    runNativeKubernetesCheck(scope, tool.ruleId, source, signal, {
      client,
      observe: vi.fn(async () => ({}) as any),
    })
  return {
    run,
    client,
    approval,
    scope,
    tool,
    source,
    resources,
    remaining: () => ({ job, config, pod }),
  }
}
it.each([false, true])(
  'runs a source-bound fixed check after verifying the gated Pod and confirms UID-scoped cleanup (failure=%s)',
  async (fail) => {
    const f = fixture({ fail }),
      result = await f.run()
    expect(result.state).toBe(fail ? 'FAIL' : 'PASS')
    expect(result.cleanupConfirmed).toBe(true)
    expect(
      f.client.json.mock.calls.filter((c) => c[0] === 'PATCH'),
    ).toHaveLength(1)
    expect(f.client.logs).toHaveBeenCalledOnce()
    expect(f.remaining()).toEqual({ job: null, config: null, pod: null })
  },
)
it.each([
  (pod: any) => pod.spec.containers.push(clone(pod.spec.containers[0])),
  (pod: any) =>
    pod.spec.containers[0].env.push({ name: 'TOKEN', value: 'credential' }),
  (pod: any) =>
    pod.spec.volumes.push({ name: 'host', hostPath: { path: '/' } }),
  (pod: any) => (pod.spec.runtimeClassName = 'runc'),
  (pod: any) => {
    pod.spec.schedulingGates = []
    pod.status.phase = 'Running'
  },
  (pod: any) => (pod.metadata.ownerReferences[0].uid = randomUUID()),
])(
  'rejects effective admission mutation before releasing the scheduling gate',
  async (mutation) => {
    const f = fixture({ mutation }),
      result = await f.run()
    expect(result.state).toBe('INCOMPLETE')
    expect(result.cleanupConfirmed).toBe(true)
    expect(
      f.client.json.mock.calls.filter((c) => c[0] === 'PATCH'),
    ).toHaveLength(0)
    expect(f.client.logs).not.toHaveBeenCalled()
  },
)
it('rejects a report for another commit and removes its owned resources', async () => {
  const f = fixture({ wrongHash: true }),
    result = await f.run()
  expect(result).toMatchObject({
    state: 'INCOMPLETE',
    reason: 'EXECUTION_UNAVAILABLE',
    cleanupConfirmed: true,
    report: null,
  })
  expect(f.remaining()).toEqual({ job: null, config: null, pod: null })
})
it('never passes when cleanup cannot be confirmed', async () => {
  const f = fixture({ cleanupError: true })
  expect(await f.run()).toMatchObject({
    state: 'INCOMPLETE',
    reason: 'CLEANUP_UNCONFIRMED',
    cleanupConfirmed: false,
    report: null,
  })
})
it('reconciles an ambiguous create outcome without rerunning the tool', async () => {
  const f = fixture({ crashCreate: true })
  expect(await f.run()).toMatchObject({
    state: 'INCOMPLETE',
    cleanupConfirmed: true,
  })
  expect(f.client.logs).not.toHaveBeenCalled()
  expect(f.remaining()).toEqual({ job: null, config: null, pod: null })
})
it('does not create resources for a cancelled attempt', async () => {
  const f = fixture(),
    controller = new AbortController()
  controller.abort()
  expect(await f.run(controller.signal)).toMatchObject({
    state: 'INCOMPLETE',
    cleanupConfirmed: true,
  })
  expect(f.client.json).not.toHaveBeenCalled()
})
it('revoked runtime controls invalidate a completed result', async () => {
  const f = fixture()
  vi.mocked(checkNativeControls)
    .mockReturnValueOnce({
      verified: true,
      failed: [],
      controlsHash: 'e'.repeat(64),
    })
    .mockReturnValue({
      verified: false,
      failed: ['changed'],
      controlsHash: '0'.repeat(64),
    })
  expect(await f.run()).toMatchObject({
    state: 'INCOMPLETE',
    cleanupConfirmed: true,
    report: null,
  })
})
it('refuses cleanup of a resource bearing another scope', async () => {
  const f = fixture(),
    json = vi.fn(async () => ({
      metadata: {
        name: f.resources.name,
        namespace: 'reviewed',
        uid: randomUUID(),
        annotations: { 'preflyt.scope-hash': '0'.repeat(64) },
      },
    }))
  await expect(
    cleanupNativeKubernetesJob(
      { json, logs: vi.fn() },
      f.approval,
      f.scope,
      f.tool.ruleId,
      f.tool,
    ),
  ).rejects.toThrow('ownership')
  expect(json.mock.calls.every((c) => c[0] !== 'DELETE')).toBe(true)
})
it('rejects old, oversized, noncanonical and mismatched report envelopes', () => {
  const hash = 'a'.repeat(64),
    valid = {
      version: 2,
      sourceHash: hash,
      exitCode: 0,
      report: Buffer.from('report').toString('base64'),
    }
  expect(
    nativeRunnerReport(Buffer.from(JSON.stringify(valid)), hash, 0)?.toString(),
  ).toBe('report')
  for (const patch of [
    { version: 1 },
    { sourceHash: 'b'.repeat(64) },
    { exitCode: 1 },
    { report: 'YR==' },
    { extra: true },
    { report: Buffer.alloc(262145).toString('base64') },
  ])
    expect(() =>
      nativeRunnerReport(
        Buffer.from(JSON.stringify({ ...valid, ...patch })),
        hash,
        0,
      ),
    ).toThrow()
})

it('accepts API-default omitted false host flags and still rejects true flags', async () => {
  const omitted = fixture({
    mutation: (pod) => {
      delete pod.spec.hostNetwork
      delete pod.spec.hostPID
      delete pod.spec.hostIPC
    },
  })
  expect(await omitted.run()).toMatchObject({
    state: 'PASS',
    cleanupConfirmed: true,
  })
  for (const key of ['hostNetwork', 'hostPID', 'hostIPC']) {
    const enabled = fixture({
      mutation: (pod) => {
        pod.spec[key] = true
      },
    })
    expect(await enabled.run()).toMatchObject({
      state: 'INCOMPLETE',
      cleanupConfirmed: true,
    })
  }
})
