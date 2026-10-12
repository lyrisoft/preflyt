import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  nativeDockerApproval,
  dockerApprovalType,
  dockerControlsProjection,
} from '../src/execution/native-docker-approval.js'
import { isolationTests } from '../src/execution/native-approval.js'
import { digest } from '../src/assessments/assessment-digest.js'
const now = Date.now()
const signer = generateKeyPairSync('ed25519')
const publicKey = signer.publicKey
  .export({ format: 'pem', type: 'spki' })
  .toString()
const keys = JSON.stringify([{ kid: 'reviewer', publicKey }])
const approval = () => ({
  version: 1,
  environmentId: 'runner-a',
  organizationIds: ['org-a'],
  runtime: 'runsc',
  controlsHash: 'a'.repeat(64),
  toolReviewHash: 'b'.repeat(64),
  controllerOrigin: 'https://runner.example.invalid',
  controllerPublicKey: publicKey,
  approvedAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 3600000).toISOString(),
  reviewDigest: 'c'.repeat(64),
  testDigests: Object.fromEntries(
    isolationTests.map((test) => [test, 'd'.repeat(64)]),
  ),
})
const token = (value: unknown) => {
  const encoded = [
    Buffer.from(
      JSON.stringify({
        alg: 'EdDSA',
        kid: 'reviewer',
        typ: dockerApprovalType,
      }),
    ).toString('base64url'),
    Buffer.from(JSON.stringify(value)).toString('base64url'),
  ].join('.')
  return (
    encoded +
    '.' +
    sign(null, Buffer.from(encoded), signer.privateKey).toString('base64url')
  )
}
describe('signed Docker runtime approval', () => {
  it('accepts a scoped signed unexpired review', () =>
    expect(
      nativeDockerApproval(token(approval()), keys, now)?.approval
        .organizationIds,
    ).toEqual(['org-a']))
  it('rejects missing/revoked and forged signatures', () => {
    const valid = token(approval())
    expect(nativeDockerApproval(valid, '[]', now)).toBeNull()
    expect(
      nativeDockerApproval(
        valid.slice(0, valid.lastIndexOf('.') + 1) +
          Buffer.alloc(64).toString('base64url'),
        keys,
        now,
      ),
    ).toBeNull()
  })
  it('rejects expired and future approvals', () => {
    expect(
      nativeDockerApproval(
        token({ ...approval(), expiresAt: new Date(now).toISOString() }),
        keys,
        now,
      ),
    ).toBeNull()
    expect(
      nativeDockerApproval(
        token({
          ...approval(),
          approvedAt: new Date(now + 1000).toISOString(),
        }),
        keys,
        now,
      ),
    ).toBeNull()
  })
  it('rejects ordinary Docker and incomplete isolation review', () => {
    expect(
      nativeDockerApproval(
        token({ ...approval(), runtime: 'runc' }),
        keys,
        now,
      ),
    ).toBeNull()
    expect(
      nativeDockerApproval(
        token({ ...approval(), testDigests: {} }),
        keys,
        now,
      ),
    ).toBeNull()
  })
  it('rejects insecure controller transport and unknown payload fields', () => {
    expect(
      nativeDockerApproval(
        token({
          ...approval(),
          controllerOrigin: 'http://runner.example.invalid',
        }),
        keys,
        now,
      ),
    ).toBeNull()
    expect(
      nativeDockerApproval(token({ ...approval(), bypass: true }), keys, now),
    ).toBeNull()
  })
  it('binds observed engine and runtime changes to the controls hash', () => {
    const info = {
      ID: 'engine-a',
      ServerVersion: '29.8.2',
      KernelVersion: 'linux',
      OperatingSystem: 'Linux',
      Driver: 'overlay2',
      SecurityOptions: ['seccomp'],
      Runtimes: { runsc: { path: '/usr/bin/runsc' } },
    }
    const first = digest(dockerControlsProjection(info, 'runsc'))
    expect(
      digest(dockerControlsProjection({ ...info, ID: 'engine-b' }, 'runsc')),
    ).not.toBe(first)
    expect(() =>
      dockerControlsProjection({ ...info, Runtimes: {} }, 'runsc'),
    ).toThrow()
  })
})
