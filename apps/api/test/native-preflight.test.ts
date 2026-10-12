import 'reflect-metadata'
import { generateKeyPairSync, sign } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  nativeApprovalType,
  parseNativeApproval,
  type NativeApproval,
} from '../src/execution/native-approval.js'
import {
  checkNativeControls,
  nativeControlsProjection,
} from '../src/execution/native-controls.js'
import { digest } from '../src/assessments/assessment-digest.js'
import {
  signNativeProbe,
  verifyNativeProbe,
} from '../src/execution/native-proof.js'
import { createNativeController } from '../src/execution/native-controller.js'
import { NativeStatusService } from '../src/execution/native-status.service.js'
const reviewer = generateKeyPairSync('ed25519'),
  controller = generateKeyPairSync('ed25519')
const pem = (key: any) => key.export({ type: 'spki', format: 'pem' }).toString()
const keys = JSON.stringify([
  { kid: 'reviewer', publicKey: pem(reviewer.publicKey) },
])
const objects = () => ({
  namespace: {
    metadata: {
      name: 'preflyt-sandbox-tests',
      uid: '12345678-1234-1234-1234-123456789abc',
      labels: {
        'pod-security.kubernetes.io/enforce': 'restricted',
        'pod-security.kubernetes.io/enforce-version': 'v1.34',
      },
    },
    status: { phase: 'Active' },
  },
  runtimeClass: {
    apiVersion: 'node.k8s.io/v1',
    kind: 'RuntimeClass',
    metadata: { name: 'preflyt-runsc', uid: 'runtime-id' },
    handler: 'runsc',
    scheduling: { nodeSelector: { 'preflyt.dev/sandbox': 'reviewed' } },
  },
  networkPolicies: [
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'deny-all',
        namespace: 'preflyt-sandbox-tests',
        uid: 'network-id',
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress'],
        ingress: [],
        egress: [],
      },
    },
  ],
  quota: {
    metadata: {
      name: 'bounded',
      namespace: 'preflyt-sandbox-tests',
      uid: 'quota-id',
    },
    spec: {
      hard: {
        pods: '10',
        'requests.cpu': '8',
        'limits.cpu': '8',
        'requests.memory': '16Gi',
        'limits.memory': '16Gi',
        'requests.storage': '20Gi',
        'requests.ephemeral-storage': '20Gi',
        'limits.ephemeral-storage': '20Gi',
      },
    },
  },
  limits: {
    metadata: {
      name: 'container',
      namespace: 'preflyt-sandbox-tests',
      uid: 'limits-id',
    },
    spec: {
      limits: [
        {
          type: 'Container',
          max: { cpu: '2', memory: '4Gi', 'ephemeral-storage': '2Gi' },
          default: { cpu: '1', memory: '2Gi', 'ephemeral-storage': '1Gi' },
          defaultRequest: {
            cpu: '500m',
            memory: '1Gi',
            'ephemeral-storage': '512Mi',
          },
        },
      ],
    },
  },
  serviceAccount: {
    metadata: {
      name: 'sandbox',
      namespace: 'preflyt-sandbox-tests',
      uid: 'sa-id',
    },
    automountServiceAccountToken: false,
  },
})
const certificate = (): NativeApproval => ({
  version: 1,
  environmentId: 'reviewed-test-runtime',
  organizationIds: ['org'],
  namespace: 'preflyt-sandbox-tests',
  namespaceUid: '12345678-1234-1234-1234-123456789abc',
  runtimeClass: 'preflyt-runsc',
  runtimeHandler: 'runsc',
  networkPolicy: 'deny-all',
  resourceQuota: 'bounded',
  limitRange: 'container',
  serviceAccount: 'sandbox',
  clusterHash: 'a'.repeat(64),
  controlsHash: digest(nativeControlsProjection(objects())),
  controllerOrigin: 'https://controller.example',
  controllerPublicKey: pem(controller.publicKey),
  approvedAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  reviewDigest: 'b'.repeat(64),
  testDigests: {
    escape: 'c'.repeat(64),
    metadata: 'c'.repeat(64),
    exfiltration: 'c'.repeat(64),
    crossRepository: 'c'.repeat(64),
    resourceAbuse: 'c'.repeat(64),
    cancellation: 'c'.repeat(64),
  },
})
function token(value: any, key = reviewer.privateKey) {
  const head = Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        kid: 'reviewer',
        typ: nativeApprovalType,
      }),
    ).toString('base64url'),
    body = Buffer.from(JSON.stringify(value)).toString('base64url'),
    input = head + '.' + body
  return input + '.' + sign(null, Buffer.from(input), key).toString('base64url')
}
const probe = (approvalHash = 'd'.repeat(64)) => ({
  nonce: '12345678-1234-1234-1234-123456789abc',
  repositoryId: '51',
  organizationId: 'org',
  approvalHash,
})
beforeEach(() => {
  vi.stubEnv('NATIVE_PREFLIGHT_ENABLED', 'true')
  vi.stubEnv('NATIVE_RUNTIME_APPROVAL', token(certificate()))
  vi.stubEnv('NATIVE_RUNTIME_REVIEW_KEYS', keys)
  vi.stubEnv('NATIVE_CONTROLLER_API_KEY', 's'.repeat(40))
  vi.stubEnv(
    'NATIVE_CONTROLLER_SIGNING_KEY',
    controller.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
describe('independent sandbox review', () => {
  it('accepts an actual Ed25519 signature bound to the reviewed controls and controller', () => {
    expect(parseNativeApproval()!.approval).toMatchObject({
      runtimeHandler: 'runsc',
    })
    expect(parseNativeApproval()!.approvalHash).toHaveLength(64)
  })
  it.each([
    { expiresAt: new Date(0).toISOString() },
    { runtimeHandler: 'runc' },
    { controllerOrigin: 'http://localhost:3010' },
    { namespace: 'production' },
    { organizationIds: ['*'] },
    { testDigests: {} },
    { unreviewedField: true },
    { expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() },
  ])('rejects incomplete or unsafe approval %j', (change) => {
    expect(
      parseNativeApproval(token({ ...certificate(), ...change }), keys),
    ).toBeNull()
  })
  it('rejects forged signatures, unknown or removed reviewers and payload tampering', () => {
    const cert = certificate(),
      signed = token(cert),
      parts = signed.split('.')
    parts[1] = Buffer.from(
      JSON.stringify({ ...cert, runtimeHandler: 'kata' }),
    ).toString('base64url')
    expect(parseNativeApproval(parts.join('.'), keys)).toBeNull()
    expect(
      parseNativeApproval(token(cert, controller.privateKey), keys),
    ).toBeNull()
    expect(parseNativeApproval(signed, '[]')).toBeNull()
  })
})
describe('effective configuration observations', () => {
  it('verifies the reviewed objects without treating it as an execution result', () =>
    expect(checkNativeControls(certificate(), objects())).toMatchObject({
      verified: true,
      failed: [],
    }))
  it.each([
    (v: any) => {
      v.namespace.metadata.uid = 'different'
    },
    (v: any) => {
      v.namespace.metadata.labels['pod-security.kubernetes.io/enforce'] =
        'baseline'
    },
    (v: any) => {
      v.runtimeClass.handler = 'runc'
    },
    (v: any) => {
      v.runtimeClass.scheduling.nodeSelector = {}
    },
    (v: any) => {
      v.networkPolicies[0].spec.egress = [{}]
    },
    (v: any) => {
      v.networkPolicies.push({
        ...v.networkPolicies[0],
        metadata: { name: 'extra-policy' },
      })
    },
    (v: any) => {
      v.quota.spec.hard.pods = '0'
    },
    (v: any) => {
      v.limits.spec.limits[0].max.memory = '100Gi'
    },
    (v: any) => {
      v.serviceAccount.automountServiceAccountToken = true
    },
    (v: any) => {
      v.serviceAccount.secrets = [{ name: 'platform-key' }]
    },
  ])(
    'blocks drift, unrestricted network, missing isolation or excessive resources',
    (mutate) => {
      const data = objects()
      mutate(data)
      expect(checkNativeControls(certificate(), data).verified).toBe(false)
    },
  )
  it('binds dedicated worker placement into the approved hash', () => {
    const data = objects(),
      cert = certificate()
    data.runtimeClass.scheduling.nodeSelector = {
      'preflyt.dev/sandbox': 'unreviewed',
    }
    expect(checkNativeControls(cert, data).failed).toContain(
      'Reviewed control configuration',
    )
  })
})
describe('signed controller observations', () => {
  it('accepts a fresh exact-scope response and rejects replay, expiry and a different controller', () => {
    const cert = certificate(),
      input = probe(),
      result = {
        ...input,
        version: 1 as const,
        environmentId: cert.environmentId,
        checkedAt: new Date().toISOString(),
        verified: true,
        failed: [],
        controlsHash: cert.controlsHash,
      }
    const signed = signNativeProbe(
      result,
      process.env.NATIVE_CONTROLLER_SIGNING_KEY!,
      cert,
    )
    expect(verifyNativeProbe(signed, input, cert)?.verified).toBe(true)
    expect(
      verifyNativeProbe(signed, { ...input, repositoryId: '52' }, cert),
    ).toBeNull()
    expect(
      verifyNativeProbe(signed, { ...input, nonce: 'another' }, cert),
    ).toBeNull()
    expect(
      verifyNativeProbe(signed, input, cert, Date.now() + 31000),
    ).toBeNull()
    expect(
      verifyNativeProbe(signed, input, {
        ...cert,
        controllerPublicKey: pem(reviewer.publicKey),
      }),
    ).toBeNull()
  })
  it('uses the same signed protocol for a separately injected Docker observer and blocks review changes', async () => {
    const cert = certificate()
    const approval = {
      version: 1 as const,
      environmentId: cert.environmentId,
      organizationIds: cert.organizationIds,
      runtime: 'runsc' as const,
      controlsHash: cert.controlsHash,
      toolReviewHash: 'a'.repeat(64),
      controllerOrigin: cert.controllerOrigin,
      controllerPublicKey: cert.controllerPublicKey,
      approvedAt: cert.approvedAt,
      expiresAt: cert.expiresAt,
      reviewDigest: cert.reviewDigest,
      testDigests: cert.testDigests,
    }
    const review = { approval, approvalHash: digest(approval) }
    let current: typeof review | null = review
    const observe = vi
      .fn()
      .mockImplementation(async () => ({
        verified: true,
        failed: [],
        controlsHash: approval.controlsHash,
      }))
    const kubeObserver = vi.fn()
    const server = createNativeController(kubeObserver, {
      review: () => current,
      observe,
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = 'http://127.0.0.1:' + (server.address() as any).port
    const input = probe(review.approvalHash)
    const request = () =>
      fetch(base + '/preflight', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.NATIVE_CONTROLLER_API_KEY,
        },
        body: JSON.stringify(input),
      })
    try {
      const good = (await (await request()).json()) as any
      expect(verifyNativeProbe(good.signature, input, approval)?.verified).toBe(
        true,
      )
      expect(kubeObserver).not.toHaveBeenCalled()
      observe.mockImplementationOnce(async () => {
        current = null
        return {
          verified: true,
          failed: [],
          controlsHash: approval.controlsHash,
        }
      })
      const changed = (await (await request()).json()) as any
      expect(
        verifyNativeProbe(changed.signature, input, approval)?.verified,
      ).toBe(false)
      expect((await request()).status).toBe(503)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
  it('runs a bounded authenticated HTTP preflight with no job-dispatch endpoint', async () => {
    const observe = vi.fn().mockResolvedValue(objects()),
      server = createNativeController(observe)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as any).port,
      base = `http://127.0.0.1:${port}`,
      review = parseNativeApproval()!,
      input = probe(review.approvalHash)
    try {
      expect(
        (
          await fetch(base + '/preflight', {
            method: 'POST',
            body: JSON.stringify(input),
          })
        ).status,
      ).toBe(401)
      expect(observe).not.toHaveBeenCalled()
      const response = await fetch(base + '/preflight', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + process.env.NATIVE_CONTROLLER_API_KEY,
          },
          body: JSON.stringify(input),
        }),
        result = (await response.json()) as any
      expect(
        verifyNativeProbe(result.signature, input, review.approval)?.verified,
      ).toBe(true)
      expect(observe).toHaveBeenCalledOnce()
      expect((await fetch(base + '/jobs', { method: 'POST' })).status).toBe(404)
      expect(
        (
          await fetch(base + '/preflight', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + process.env.NATIVE_CONTROLLER_API_KEY,
            },
            body: JSON.stringify({ ...input, organizationId: 'another' }),
          })
        ).status,
      ).toBe(503)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
describe('API fail-closed boundaries', () => {
  it('refuses ungranted repositories before reading configuration or contacting the controller', async () => {
    const access = {
        requireRepository: vi.fn().mockRejectedValue(new Error('Denied')),
      },
      fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      new NativeStatusService(access as any).status(
        { organizationId: 'org' } as any,
        '51',
      ),
    ).rejects.toThrow('Denied')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('retains imported-only mode without a signed review', async () => {
    vi.stubEnv('NATIVE_RUNTIME_APPROVAL', '')
    const access = { requireRepository: vi.fn().mockResolvedValue({}) },
      fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(
      await new NativeStatusService(access as any).status(
        { organizationId: 'org' } as any,
        '51',
      ),
    ).toMatchObject({
      mode: 'INGEST_ONLY',
      executionAvailable: false,
      reason: 'REVIEW_REQUIRED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('retries a temporarily busy controller and verifies the signed response', async () => {
    const access = { requireRepository: vi.fn().mockResolvedValue({}) }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      if (fetchSpy.mock.calls.length === 1)
        return new Response(null, { status: 429 })
      const review = parseNativeApproval()!,
        input = JSON.parse(options!.body as string)
      return new Response(
        JSON.stringify({
          signature: signNativeProbe(
            {
              ...input,
              version: 1,
              environmentId: review.approval.environmentId,
              checkedAt: new Date().toISOString(),
              verified: true,
              failed: [],
              controlsHash: review.approval.controlsHash,
            },
            process.env.NATIVE_CONTROLLER_SIGNING_KEY!,
            review.approval,
          ),
        }),
        { status: 200 },
      )
    })
    expect(
      await new NativeStatusService(access as any).status(
        { organizationId: 'org' } as any,
        '51',
      ),
    ).toMatchObject({ preflightVerified: true, reason: 'DISPATCHER_REQUIRED' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(access.requireRepository).toHaveBeenCalledTimes(2)
  })
  it('keeps native execution blocked even after a verified preflight', async () => {
    const access = { requireRepository: vi.fn().mockResolvedValue({}) }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const review = parseNativeApproval()!,
        input = JSON.parse(options!.body as string)
      return new Response(
        JSON.stringify({
          signature: signNativeProbe(
            {
              ...input,
              version: 1,
              environmentId: review.approval.environmentId,
              checkedAt: new Date().toISOString(),
              verified: true,
              failed: [],
              controlsHash: review.approval.controlsHash,
            },
            process.env.NATIVE_CONTROLLER_SIGNING_KEY!,
            review.approval,
          ),
        }),
        { status: 200 },
      )
    })
    expect(
      await new NativeStatusService(access as any).status(
        { organizationId: 'org' } as any,
        '51',
      ),
    ).toMatchObject({
      mode: 'INGEST_ONLY',
      executionAvailable: false,
      preflightVerified: true,
      reason: 'DISPATCHER_REQUIRED',
    })
    expect(access.requireRepository).toHaveBeenCalledTimes(2)
  })
  it('rejects access revoked during a controller response', async () => {
    const access = {
      requireRepository: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValue(new Error('Revoked')),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ signature: 'forged' }), { status: 200 }),
    )
    await expect(
      new NativeStatusService(access as any).status(
        { organizationId: 'org' } as any,
        '51',
      ),
    ).rejects.toThrow('Revoked')
  })
})
