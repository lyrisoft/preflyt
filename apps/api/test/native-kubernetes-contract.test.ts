import { randomUUID, createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { nativeKubernetesResources } from '../src/execution/native-kubernetes-contract.js'
import { gitObjectHash } from '../src/execution/native-source.js'
import { digest } from '../src/assessments/assessment-digest.js'
const url = new URL(
  '../../../docs/deployment/native-runner/source-initializer.mjs',
  import.meta.url,
).href
const { initializeNativeSource } = await import(/* @vite-ignore */ url)
let root: string
const clean = async (path: string) => {
  await chmod(path, 0o700).catch(() => {})
  await rm(path, { recursive: true, force: true })
}
afterEach(async () => {
  if (root) await clean(root)
})
function fixture(content = Buffer.from([0, 1, 128, 255])) {
  const blob = gitObjectHash('blob', content),
    treeSha = gitObjectHash(
      'tree',
      Buffer.concat([
        Buffer.from('100755 binary.bin\0'),
        Buffer.from(blob, 'hex'),
      ]),
    )
  const file = {
    path: 'binary.bin',
    mode: '100755' as const,
    blobSha: blob,
    sha256: createHash('sha256').update(content).digest('hex'),
    size: content.length,
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
        size: content.length,
      },
    ],
    files: [file],
    totalBytes: content.length,
  }
  const source = {
    ...manifest,
    files: [{ ...file, content: content.toString('base64') }],
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
  const approval = {
    organizationIds: ['org'],
    namespace: 'reviewed',
    runtimeClass: 'runsc',
    serviceAccount: 'sandbox',
  } as any
  return { source, scope, tool, approval }
}
it('keeps source delivery and check execution separate, credential-free and bounded', () => {
  const { source, scope, tool, approval } = fixture()
  const value = nativeKubernetesResources(
    scope,
    tool.ruleId,
    tool,
    approval,
    source,
  )
  expect(value.configMap.immutable).toBe(true)
  expect(JSON.parse(value.configMap.data['bundle.json']).sourceHash).toBe(
    source.sourceHash,
  )
  const pod = value.job.spec.template.spec
  expect(pod).toMatchObject({
    runtimeClassName: 'runsc',
    automountServiceAccountToken: false,
    hostNetwork: false,
    hostPID: false,
    hostIPC: false,
    restartPolicy: 'Never',
  })
  expect(value.job.spec).toMatchObject({
    backoffLimit: 0,
    activeDeadlineSeconds: 300,
    parallelism: 1,
  })
  expect(pod.securityContext.runAsUser).toBe(65532)
  for (const container of [...pod.containers, ...pod.initContainers]) {
    expect(container.image).toBe(tool.image)
    expect(container.securityContext).toMatchObject({
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ['ALL'] },
    })
    expect(container.env.every((e) => !/TOKEN|KEY|SECRET/.test(e.name))).toBe(
      true,
    )
  }
  expect(pod.containers[0].volumeMounts[0].readOnly).toBe(true)
  expect(pod.volumes.every((v) => !('hostPath' in v) && !('secret' in v))).toBe(
    true,
  )
  expect(value.name.length).toBeLessThanOrEqual(59)
  expect(value.job.metadata.annotations['preflyt.scope-hash']).toBe(
    value.scopeHash,
  )
  expect(
    Object.values(value.job.metadata.labels).every((v) => v.length <= 63),
  ).toBe(true)
})
it('rejects wrong source, unreviewed images, foreign organization and oversized delivery', () => {
  const { source, scope, tool, approval } = fixture()
  expect(() =>
    nativeKubernetesResources(
      { ...scope, sourceHash: 'f'.repeat(64) },
      tool.ruleId,
      tool,
      approval,
      source,
    ),
  ).toThrow()
  expect(() =>
    nativeKubernetesResources(
      scope,
      tool.ruleId,
      { ...tool, image: 'image:latest' },
      approval,
      source,
    ),
  ).toThrow()
  expect(() =>
    nativeKubernetesResources(
      { ...scope, organizationId: 'foreign' },
      tool.ruleId,
      tool,
      approval,
      source,
    ),
  ).toThrow()
  const large = fixture(Buffer.alloc(450000))
  expect(() =>
    nativeKubernetesResources(
      large.scope,
      large.tool.ruleId,
      large.tool,
      large.approval,
      large.source,
    ),
  ).toThrow('delivery limit')
})
it('materializes binary bytes and executable modes, then verifies the whole mounted manifest', async () => {
  const { source, scope } = fixture()
  root = await mkdtemp(join(tmpdir(), 'preflyt-kube-init-'))
  await initializeNativeSource(root, source, scope)
  expect(await readFile(join(root, 'binary.bin'))).toEqual(
    Buffer.from([0, 1, 128, 255]),
  )
  expect((await stat(join(root, 'binary.bin'))).mode & 0o777).toBe(0o555)
  expect((await stat(root)).mode & 0o777).toBe(0o555)
})
it('refuses traversal, dirty source and duplicate or malformed file delivery before creating files', async () => {
  const { source, scope } = fixture()
  root = await mkdtemp(join(tmpdir(), 'preflyt-kube-init-'))
  for (const patch of [
    { path: '../outside' },
    { path: '.git/config' },
    { content: 'invalid' },
    { mode: '120000' },
  ]) {
    await expect(
      initializeNativeSource(
        root,
        { ...source, files: [{ ...source.files[0], ...patch }] },
        scope,
      ),
    ).rejects.toThrow()
  }
  await mkdir(join(root, 'existing'))
  await expect(initializeNativeSource(root, source, scope)).rejects.toThrow()
})
