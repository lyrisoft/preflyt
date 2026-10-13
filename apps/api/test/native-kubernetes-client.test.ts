import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('node:https', () => ({ request: vi.fn() }))
import { request } from 'node:https'
import { nativeKubernetesClient } from '../src/execution/native-kubernetes-client.js'
import { digest } from '../src/assessments/assessment-digest.js'
let root: string
const directories: string[] = []
const server = 'https://reviewed-cluster.example'
async function fixture(status = 200, redirect = false) {
  root = await mkdtemp(join(tmpdir(), 'preflyt-kube-transport-'))
  directories.push(root)
  const ca =
    '-----BEGIN CERTIFICATE-----\ntransport-test-placeholder\n-----END CERTIFICATE-----\n'
  await writeFile(join(root, 'ca'), ca, { mode: 0o600 })
  await writeFile(join(root, 'token'), 'fixture-only-token', { mode: 0o600 })
  vi.stubEnv('NATIVE_CLUSTER_SERVER', server)
  vi.stubEnv('NATIVE_CLUSTER_CA_FILE', join(root, 'ca'))
  vi.stubEnv('NATIVE_CLUSTER_TOKEN_FILE', join(root, 'token'))
  vi.mocked(request).mockImplementation(((
    url: any,
    options: any,
    callback: any,
  ) => {
    const req = new EventEmitter() as any
    req.end = () => {
      const response = new EventEmitter() as any
      response.statusCode = redirect ? 302 : status
      response.headers = redirect
        ? { location: 'https://unapproved.example' }
        : {}
      response.destroy = () => response.emit('error', new Error('closed'))
      callback(response)
      queueMicrotask(() => {
        response.emit('data', Buffer.from('{}'))
        response.emit('end')
      })
    }
    return req
  }) as any)
  const approval = {
    namespace: 'reviewed',
    clusterHash: digest({ server, caHash: digest(ca) }),
  } as any
  return { approval, client: await nativeKubernetesClient(approval) }
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
it('pins the reviewed cluster and CA, validates TLS and uses only its explicit dedicated token', async () => {
  const { client } = await fixture()
  await client.json('GET', '/api/v1/namespaces/reviewed/configmaps/scoped')
  const [url, options] = vi.mocked(request).mock.calls[0] as any
  expect(url.origin).toBe(server)
  expect(options.rejectUnauthorized).toBe(true)
  expect(options.ca.toString()).toContain('BEGIN CERTIFICATE')
  expect(options.headers.Authorization).toBe('Bearer fixture-only-token')
  expect(options.signal).toBeInstanceOf(AbortSignal)
})
it('rejects other namespaces, secrets, exec and path escape before sending a request', async () => {
  const { client } = await fixture()
  for (const path of [
    '/api/v1/namespaces/foreign/configmaps/name',
    '/api/v1/namespaces/reviewed/secrets/name',
    '/api/v1/namespaces/reviewed/pods/name/exec',
    '/api/v1/namespaces/reviewed/pods/../../secrets',
  ])
    await expect(client.json('GET', path)).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})
it('uses JSON merge patch only to release the previously verified Pod', async () => {
  const { client } = await fixture()
  await client.json('PATCH', '/api/v1/namespaces/reviewed/pods/scoped', {
    metadata: { resourceVersion: '1' },
    spec: { schedulingGates: [] },
  })
  expect(
    (vi.mocked(request).mock.calls[0] as any)[1].headers['Content-Type'],
  ).toBe('application/merge-patch+json')
})
it('never follows redirects and treats provider denial as a failed operation', async () => {
  const { client } = await fixture(403)
  await expect(
    client.json('GET', '/api/v1/namespaces/reviewed/jobs/scoped'),
  ).rejects.toThrow('403')
  await fixture(200, true)
  await expect(
    client.json('GET', '/api/v1/namespaces/reviewed/jobs/scoped'),
  ).rejects.toThrow('302')
  expect(request).toHaveBeenCalledTimes(2)
})
it('requires the same reviewed cluster connection and does not use an ambient context', async () => {
  const { approval } = await fixture()
  await expect(
    nativeKubernetesClient({ ...approval, clusterHash: 'a'.repeat(64) }),
  ).rejects.toThrow('changed')
  vi.stubEnv('NATIVE_CLUSTER_SERVER', 'http://reviewed-cluster.example')
  await expect(nativeKubernetesClient(approval)).rejects.toThrow('Dedicated')
  expect(request).not.toHaveBeenCalled()
})
