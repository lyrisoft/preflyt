import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { digest } from '../src/assessments/assessment-digest.js'
import {
  nativeDockerArgs,
  verifyNativeDockerInspection,
} from '../src/execution/native-docker-job.js'
const scope = {
  requestId: randomUUID(),
  organizationId: 'org-a',
  repositoryId: '1',
  sourceSha: 'a'.repeat(40),
  sourceHash: 'b'.repeat(64),
  planHash: 'c'.repeat(64),
}
const tool = {
  ruleId: 'secrets.scan',
  image: 'ghcr.io/preflyt/gitleaks@sha256:' + 'd'.repeat(64),
  toolVersion: '8',
  license: 'MIT',
  configHash: 'e'.repeat(64),
  reviewDigest: 'f'.repeat(64),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  databaseBuiltAt: null,
}
const source = '/tmp/preflyt-native-fixture/source'
const inspection = () => ({
  Config: {
    Env: [
      'PREFLYT_SOURCE_REPOSITORY=' + scope.repositoryId,
      'PREFLYT_SOURCE_SHA=' + scope.sourceSha,
      'PREFLYT_SOURCE_HASH=' + scope.sourceHash,
    ],
    Image: tool.image,
    User: '65532:65532',
    WorkingDir: '/workspace',
    Entrypoint: ['/usr/local/bin/node'],
    Cmd: ['/opt/preflyt/runner.mjs', 'secrets.scan'],
    Labels: {
      'preflyt.scope': digest({ scope, ruleId: 'secrets.scan', tool }),
    },
  },
  HostConfig: {
    Runtime: 'runsc',
    NetworkMode: 'none',
    ReadonlyRootfs: true,
    Privileged: false,
    PidsLimit: 128,
    NanoCpus: 1000000000,
    Memory: 2147483648,
    MemorySwap: 2147483648,
    LogConfig: { Type: 'none' },
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges=true'],
    Ulimits: [
      { Name: 'nofile', Soft: 1024, Hard: 1024 },
      { Name: 'core', Soft: 0, Hard: 0 },
    ],
    Tmpfs: {
      '/scratch': 'rw,nosuid,nodev,noexec,size=134217728,mode=1777',
      '/reports': 'rw,nosuid,nodev,noexec,size=1048576,mode=1777',
    },
  },
  Mounts: [
    { Type: 'bind', Source: source, Destination: '/workspace', RW: false },
  ],
})
const verify = (value: unknown) =>
  verifyNativeDockerInspection(
    value,
    scope,
    'secrets.scan',
    tool,
    source,
    'runsc',
  )
describe('Docker native job controls', () => {
  it('fixes the command and applies bounded secret-free container options', () => {
    const { args } = nativeDockerArgs(
      scope,
      'secrets.scan',
      tool,
      source,
      'runsc',
    )
    expect(args).toContain('none')
    expect(args).toContain('no-new-privileges=true')
    expect(args).not.toContain('seccomp=unconfined')
    expect(args.join(' ')).not.toContain('docker.sock')
    expect(args.slice(-3)).toEqual([
      tool.image,
      '/opt/preflyt/runner.mjs',
      'secrets.scan',
    ])
  })
  it('rejects supplied host paths and unreviewed images', () => {
    expect(() =>
      nativeDockerArgs(
        scope,
        'secrets.scan',
        tool,
        '/tmp/source,target=/var/run/docker.sock',
        'runsc',
      ),
    ).toThrow()
    expect(() =>
      nativeDockerArgs(
        scope,
        'secrets.scan',
        { ...tool, image: 'gitleaks:latest' },
        source,
        'runsc',
      ),
    ).toThrow()
  })
  it('accepts observed controls matching the reviewed invocation', () =>
    expect(() => verify(inspection())).not.toThrow())
  it('rejects network, privilege, writable source and unconfined changes', () => {
    for (const changed of [
      { NetworkMode: 'host' },
      { Privileged: true },
      { Memory: 0 },
      { SecurityOpt: ['seccomp=unconfined'] },
      { Devices: [{}] },
    ]) {
      const value = inspection()
      expect(() =>
        verify({ ...value, HostConfig: { ...value.HostConfig, ...changed } }),
      ).toThrow()
    }
    const value = inspection()
    expect(() =>
      verify({ ...value, Mounts: [{ ...value.Mounts[0], RW: true }] }),
    ).toThrow()
    expect(() =>
      verify({ ...value, Config: { ...value.Config, Cmd: ['sh'] } }),
    ).toThrow()
  })
})

it('gives Health reports bounded working space while verifying the effective limit', () => {
 const args=nativeDockerArgs(scope,'secrets.scan',tool,source,'runsc','health').args
 expect(args).toContain('/reports:rw,nosuid,nodev,noexec,size=67108864,mode=1777')
 const info=inspection()
 info.HostConfig.Tmpfs['/reports']='rw,nosuid,nodev,noexec,size=67108864,mode=1777'
 expect(()=>verifyNativeDockerInspection(info,scope,'secrets.scan',tool,source,'runsc','health')).not.toThrow()
 expect(()=>verify(info)).toThrow()
 info.HostConfig.Tmpfs['/reports']='rw,nosuid,nodev,noexec,size=134217728,mode=1777'
 expect(()=>verifyNativeDockerInspection(info,scope,'secrets.scan',tool,source,'runsc','health')).toThrow()
})
