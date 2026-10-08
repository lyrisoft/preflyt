import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import {
  attestationClaims,
  attestationPolicy,
  validatedProvenance,
  sha256,
} from '../src/github-events/ci-attestation-policy.js'
import { digest } from '../src/assessments/assessment-digest.js'
import { CiAttestationVerifier } from '../src/github-events/ci-attestation-verifier.js'
const context = {
  artifactId: 'a',
  artifactSha256: 'd'.repeat(64),
  repositoryId: '501',
  repositoryName: 'fixture/app',
  sourceSha: 'a'.repeat(40),
  runId: '44',
  runAttempt: 1,
  signerWorkflow: 'fixture/app/.github/workflows/ci.yml',
}
const certificate = {
  issuer: 'https://token.actions.githubusercontent.com',
  sourceRepositoryURI: 'https://github.com/fixture/app',
  sourceRepositoryIdentifier: '501',
  sourceRepositoryDigest: context.sourceSha,
  runnerEnvironment: 'github-hosted',
  runInvocationURI: 'https://github.com/fixture/app/actions/runs/44/attempts/1',
  buildSignerURI:
    'https://github.com/fixture/app/.github/workflows/ci.yml@refs/heads/main',
  subjectAlternativeName:
    'https://github.com/fixture/app/.github/workflows/ci.yml@refs/heads/main',
  buildSignerDigest: 'c'.repeat(40),
}
const output = (cert = certificate) => [
  {
    verificationResult: {
      signature: { certificate: cert },
      verifiedTimestamps: [{}],
      statement: {
        predicateType: 'https://slsa.dev/provenance/v1',
        subject: [{ digest: { sha256: context.artifactSha256 } }],
        predicate: { arbitrary: 'ignored' },
      },
    },
  },
]
const configure = () => {
  vi.stubEnv('CI_ATTESTATION_GH_PATH', '/tmp/gh')
  vi.stubEnv('CI_ATTESTATION_GH_SHA256', 'e'.repeat(64))
  vi.stubEnv('CI_ATTESTATION_ROOT_PATH', '/tmp/root')
  vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', 'f'.repeat(64))
  vi.stubEnv(
    'CI_ATTESTATION_WORKFLOWS',
    JSON.stringify([context.signerWorkflow]),
  )
}
afterEach(() => vi.unstubAllEnvs())
it('selects only certificate-backed exact identity and ignores arbitrary predicates', () => {
  expect(attestationClaims(output(), context)).toMatchObject(context)
  expect(JSON.stringify(attestationClaims(output(), context))).not.toContain(
    'arbitrary',
  )
})
it.each([
  'issuer',
  'sourceRepositoryURI',
  'sourceRepositoryIdentifier',
  'sourceRepositoryDigest',
  'runnerEnvironment',
  'runInvocationURI',
  'buildSignerURI',
  'subjectAlternativeName',
  'buildSignerDigest',
] as const)('rejects mismatched signed %s', (field) => {
  expect(() =>
    attestationClaims(output({ ...certificate, [field]: 'forged' }), context),
  ).toThrow()
})
it('rejects missing timestamps, different subjects and ambiguous results', () => {
  const a = output()
  a[0].verificationResult.verifiedTimestamps = []
  expect(() => attestationClaims(a, context)).toThrow()
  expect(() => attestationClaims([...output(), ...output()], context)).toThrow()
  const b = output()
  b[0].verificationResult.statement.subject[0].digest.sha256 = 'b'.repeat(64)
  expect(() => attestationClaims(b, context)).toThrow()
})
it('fails closed on missing configuration and invalid workflow allowlists', async () => {
  vi.stubEnv('CI_ATTESTATION_WORKFLOWS', '')
  expect(attestationPolicy()).toBeNull()
  await expect(
    new CiAttestationVerifier().verify(
      Buffer.from('x'),
      Buffer.from('{}'),
      context,
    ),
  ).rejects.toThrow('not configured')
  configure()
  vi.stubEnv('CI_ATTESTATION_WORKFLOWS', '["owner/repo/../../bad.yml"]')
  expect(attestationPolicy()).toBeNull()
})
it('rejects changed bundles, receipts, identities and revoked deployment policies', () => {
  configure()
  const bundle = Buffer.from('{}'),
    policyDigest = attestationPolicy()!.digest,
    claims = attestationClaims(output(), context)
  const bundleSha256 = sha256(bundle)
  const receipt = {
    id: 'r',
    bundle,
    bundleSha256,
    policyDigest,
    claims,
    receiptHash: digest({ version: 1, bundleSha256, policyDigest, claims }),
  }
  expect(validatedProvenance(receipt, context)).toMatchObject({
    status: 'VERIFIED_ATTESTATION',
  })
  expect(
    validatedProvenance(
      { ...receipt, bundle: Buffer.from('changed') },
      context,
    ),
  ).toBeNull()
  expect(
    validatedProvenance(
      { ...receipt, claims: { ...claims, sourceSha: 'forged' } },
      context,
    ),
  ).toBeNull()
  expect(validatedProvenance(receipt, { ...context, runAttempt: 2 })).toBeNull()
  vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', 'b'.repeat(64))
  expect(validatedProvenance(receipt, context)).toBeNull()
})

it.skipIf(!process.env.PREFLYT_TEST_GH_PATH)(
  'cryptographically verifies an official signed fixture offline and rejects tampering',
  async () => {
    const binary = process.env.PREFLYT_TEST_GH_PATH!
    const root = fileURLToPath(
      new URL('./fixtures/attestation/trusted-root.jsonl', import.meta.url),
    )
    const content = await readFile(
      new URL('./fixtures/attestation/artifact.bin', import.meta.url),
    )
    const bundle = await readFile(
      new URL('./fixtures/attestation/bundle.json', import.meta.url),
    )
    const actual = {
      ...context,
      artifactSha256: sha256(content),
      repositoryId: '763287532',
      repositoryName: 'actions/attest-demo',
      sourceSha: 'a6c23b9806c593664f68637c8f9d45dfcf98b2db',
      runId: '8788389601',
      signerWorkflow: 'actions/attest-demo/.github/workflows/build-python.yml',
    }
    vi.stubEnv('CI_ATTESTATION_GH_PATH', binary)
    vi.stubEnv('CI_ATTESTATION_GH_SHA256', sha256(await readFile(binary)))
    vi.stubEnv('CI_ATTESTATION_ROOT_PATH', root)
    vi.stubEnv('CI_ATTESTATION_ROOT_SHA256', sha256(await readFile(root)))
    vi.stubEnv(
      'CI_ATTESTATION_WORKFLOWS',
      JSON.stringify([actual.signerWorkflow]),
    )
    const verifier = new CiAttestationVerifier()
    const pending = verifier.verify(content, bundle, actual)
    await expect(verifier.verify(content, bundle, actual)).rejects.toThrow(
      'busy',
    )
    expect((await pending).claims).toMatchObject(actual)
    await expect(
      verifier.verify(Buffer.from('tampered'), bundle, actual),
    ).rejects.toThrow('cryptographically verified')
    const invalidSignature = JSON.parse(bundle.toString())
    invalidSignature.dsseEnvelope.signatures[0].sig =
      Buffer.alloc(64).toString('base64')
    await expect(
      verifier.verify(
        content,
        Buffer.from(JSON.stringify(invalidSignature)),
        actual,
      ),
    ).rejects.toThrow('cryptographically verified')
    await expect(
      verifier.verify(content, bundle, { ...actual, runAttempt: 2 }),
    ).rejects.toThrow('cryptographically verified')
    vi.stubEnv('CI_ATTESTATION_GH_SHA256', '0'.repeat(64))
    await expect(verifier.verify(content, bundle, actual)).rejects.toThrow(
      'changed',
    )
  },
)
