// Generated fixtures only. Never uses the operator's default Kubernetes context or runtime approvals.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { nativeKubernetesResources } from '../src/execution/native-kubernetes-contract.js'
import {
  verifyNativeKubernetesPod,
  cleanupNativeKubernetesJob,
} from '../src/execution/native-kubernetes-job.js'
import { gitObjectHash } from '../src/execution/native-source.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
import { digest } from '../src/assessments/assessment-digest.js'
import type { NativeApproval } from '../src/execution/native-approval.js'
const config = process.env.PREFLYT_FIXTURE_KUBECONFIG
if (!config || !config.startsWith('/private/tmp/preflyt-gap-'))
  throw new Error('Explicit disposable fixture kubeconfig required')
const kubectl = (args: string[], input?: string) =>
  execFileSync('kubectl', ['--kubeconfig', config, ...args], {
    input,
    encoding: 'utf8',
    timeout: 30000,
  })
assert.equal(
  kubectl(['config', 'current-context']).trim(),
  'kind-preflyt-gap-fixture',
)
const kube = JSON.parse(kubectl(['config', 'view', '--minify', '-o', 'json']))
assert.match(kube.clusters[0].cluster.server, /^https:\/\/127\.0\.0\.1:\d+$/)
const namespace = 'preflyt-sandbox-fixture'
const apply = (value: unknown) =>
  kubectl(['apply', '-f', '-'], JSON.stringify(value))
apply({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: { name: namespace, labels: { 'preflyt.fixture': 'generated' } },
})
apply({
  apiVersion: 'v1',
  kind: 'ServiceAccount',
  metadata: { name: 'fixture', namespace },
  automountServiceAccountToken: false,
})
apply({
  apiVersion: 'node.k8s.io/v1',
  kind: 'RuntimeClass',
  metadata: { name: 'preflyt-fixture-runc' },
  handler: 'runc',
})
const proxy = spawn(
  'kubectl',
  ['--kubeconfig', config, 'proxy', '--address=127.0.0.1', '--port=0'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
const port = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error('Fixture proxy unavailable')),
    10000,
  )
  proxy.stdout.on('data', (data) => {
    const match = /127\.0\.0\.1:(\d+)/.exec(data.toString())
    if (match) {
      clearTimeout(timer)
      resolve(match[1]!)
    }
  })
  proxy.once('error', reject)
})
const client = {
  async json(method: string, path: string, body?: unknown) {
    const response = await fetch('http://127.0.0.1:' + port + path, {
      method,
      headers: {
        'content-type':
          method === 'PATCH'
            ? 'application/merge-patch+json'
            : 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 404) return null
    if (!response.ok)
      throw new Error(
        'Fixture API ' + response.status + ': ' + (await response.text()),
      )
    return response.json()
  },
  async logs(path: string) {
    const response = await fetch('http://127.0.0.1:' + port + path, {
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error('Fixture logs unavailable')
    return Buffer.from(await response.arrayBuffer())
  },
}
try {
  for (const expected of ['PASS', 'FAIL', 'INCOMPLETE']) {
    const text =
      expected === 'INCOMPLETE'
        ? 'exports.value=1;\n'
        : 'const {test}=require("node:test");const assert=require("node:assert/strict");test("generated",()=>assert.equal(1,' +
          (expected === 'PASS' ? '1' : '2') +
          '));\n'
    const bytes = Buffer.from(text),
      path = expected === 'INCOMPLETE' ? 'app.js' : 'fixture.test.js',
      blobSha = gitObjectHash('blob', bytes)
    const treeSha = gitObjectHash(
      'tree',
      Buffer.concat([
        Buffer.from('100644 ' + path + '\0'),
        Buffer.from(blobSha, 'hex'),
      ]),
    )
    const file = {
      path,
      mode: '100644',
      blobSha,
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
          path,
          mode: '100644',
          type: 'blob',
          sha: blobSha,
          size: bytes.length,
        },
      ],
      files: [file],
      totalBytes: bytes.length,
    }
    const source = {
      ...manifest,
      sourceHash: digest(manifest),
      files: [{ ...file, content: bytes.toString('base64') }],
    }
    const scope = {
      requestId: randomUUID(),
      organizationId: 'fixture',
      repositoryId: '51',
      sourceSha: source.sourceSha,
      sourceHash: source.sourceHash,
      planHash: 'b'.repeat(64),
    }
    const tool = {
      ruleId: 'tests.required' as const,
      image: 'registry.invalid/fixture@sha256:' + 'c'.repeat(64),
      toolVersion: 'fixture',
      license: 'MIT',
      configHash: 'd'.repeat(64),
      reviewDigest: 'e'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      databaseBuiltAt: null,
    }
    const approval = {
      namespace,
      organizationIds: ['fixture'],
      runtimeClass: 'preflyt-fixture-runc',
      serviceAccount: 'fixture',
    } as NativeApproval
    const resources = nativeKubernetesResources(
      scope,
      'tests.required',
      tool,
      approval,
      source,
    )
    // Local generated-only image substitution is explicit and never an approved production inventory.
    for (const container of [
      ...resources.job.spec.template.spec.containers,
      ...resources.job.spec.template.spec.initContainers,
    ]) {
      container.image = 'preflyt-native-node:fixture'
      container.imagePullPolicy = 'Never'
    }
    let created = false
    try {
      await client.json(
        'POST',
        '/api/v1/namespaces/' + namespace + '/configmaps',
        resources.configMap,
      )
      created = true
      const job: any = await client.json(
        'POST',
        '/apis/batch/v1/namespaces/' + namespace + '/jobs',
        resources.job,
      )
      const inventoryPath =
        '/api/v1/namespaces/' +
        namespace +
        '/pods?labelSelector=' +
        encodeURIComponent('preflyt.scope=' + resources.scopeHash.slice(0, 40))
      let admitted: string | null = null,
        complete = false
      const deadline = Date.now() + 120000
      while (Date.now() < deadline) {
        const pods: any = await client.json('GET', inventoryPath)
        assert.ok(pods.items.length <= 1)
        const pod = pods.items[0]
        if (pod) {
          verifyNativeKubernetesPod(
            pod,
            resources.job,
            resources.scopeHash,
            job.metadata.uid,
            admitted !== null,
          )
          if (!admitted) {
            const released: any = await client.json(
              'PATCH',
              '/api/v1/namespaces/' + namespace + '/pods/' + pod.metadata.name,
              {
                metadata: {
                  uid: pod.metadata.uid,
                  resourceVersion: pod.metadata.resourceVersion,
                },
                spec: { schedulingGates: [] },
              },
            )
            verifyNativeKubernetesPod(
              released,
              resources.job,
              resources.scopeHash,
              job.metadata.uid,
              true,
            )
            admitted = pod.metadata.uid
          } else {
            assert.equal(pod.metadata.uid, admitted)
            const status = pod.status?.containerStatuses?.[0]?.state?.terminated
            if (status) {
              assert.equal(
                pod.status.initContainerStatuses[0].state.terminated.exitCode,
                0,
              )
              const envelope = JSON.parse(
                (
                  await client.logs(
                    '/api/v1/namespaces/' +
                      namespace +
                      '/pods/' +
                      pod.metadata.name +
                      '/log?container=check',
                  )
                ).toString(),
              )
              assert.equal(envelope.sourceHash, source.sourceHash)
              assert.equal(envelope.exitCode, status.exitCode)
              assert.equal(
                nativeCheckOutcome(
                  'tests.required',
                  status.exitCode,
                  envelope.report
                    ? Buffer.from(envelope.report, 'base64')
                    : null,
                ).state,
                expected,
              )
              complete = true
              break
            }
          }
        }
        await delay(500)
      }
      assert.ok(complete, 'Fixture job must complete')
      console.log('Kubernetes generated fixture: ' + expected)
    } finally {
      if (created)
        await cleanupNativeKubernetesJob(
          client,
          approval,
          scope,
          'tests.required',
          tool,
        )
    }
  }
  console.log(
    'Generated Kubernetes admission, exact-source reporting and UID-owned cleanup passed. No strong-isolation or connected-repository approval is claimed.',
  )
} finally {
  proxy.kill('SIGTERM')
}
