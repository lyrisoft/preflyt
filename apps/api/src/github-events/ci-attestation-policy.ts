import { organizationProofPolicy, approvedOrganizationClaims } from './organization-report-proof.js'
import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { digest } from '../assessments/assessment-digest.js'
export const ATTESTATION_VERSION = 1
export const MAX_BUNDLE_BYTES = 512 * 1024
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')
export function attestationPolicy() {
  const binary = process.env.CI_ATTESTATION_GH_PATH
  const binaryDigest = process.env.CI_ATTESTATION_GH_SHA256
  const root = process.env.CI_ATTESTATION_ROOT_PATH
  const rootDigest = process.env.CI_ATTESTATION_ROOT_SHA256
  let workflows: unknown
  try {
    workflows = JSON.parse(process.env.CI_ATTESTATION_WORKFLOWS ?? 'null')
  } catch {
    return null
  }
  if (
    !binary ||
    !root ||
    !isAbsolute(binary) ||
    !isAbsolute(root) ||
    !/^[a-f0-9]{64}$/.test(binaryDigest ?? '') ||
    !/^[a-f0-9]{64}$/.test(rootDigest ?? '') ||
    !Array.isArray(workflows) ||
    !workflows.length ||
    workflows.length > 100 ||
    workflows.some(
      (w) =>
        typeof w !== 'string' ||
        !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(
          w,
        ),
    )
  )
    return null
  const projection = {
    version: ATTESTATION_VERSION,
    binaryDigest: binaryDigest!,
    rootDigest: rootDigest!,
    workflows: [...new Set(workflows as string[])].sort(),
    denySelfHosted: true,
    predicateType: 'https://slsa.dev/provenance/v1',
  }
  return { ...projection, binary, root, digest: digest(projection) }
}
/** Unknown modes fail closed; selecting a mode never falls back to weaker proof. */
export function reportProofPolicy() {
  const mode=process.env.CI_REPORT_PROOF_MODE ?? 'github-native'
  if(mode==='organization-key')return organizationProofPolicy()
  if(mode!=='github-native')return null
  const policy=attestationPolicy()
  return policy ? {...policy,mode:'github-native' as const} : null
}
export type AttestationContext = {
  artifactId: string
  artifactSha256: string
  repositoryId: string
  repositoryName: string
  sourceSha: string
  runId: string
  runAttempt: number
  signerWorkflow: string
}
// Only certificate fields and verified timestamps establish identity. Ignore unsigned/arbitrary predicate claims.
export function attestationClaims(
  output: unknown,
  context: AttestationContext,
) {
  if (!Array.isArray(output) || output.length !== 1)
    throw Error('Ambiguous verification result')
  const v = output[0]?.verificationResult
  const cert = v?.signature?.certificate
  const repo = `https://github.com/${context.repositoryName}`
  const signer = `https://github.com/${context.signerWorkflow}@`
  if (
    !cert ||
    cert.issuer !== 'https://token.actions.githubusercontent.com' ||
    cert.sourceRepositoryURI !== repo ||
    cert.sourceRepositoryIdentifier !== context.repositoryId ||
    cert.sourceRepositoryDigest !== context.sourceSha ||
    cert.runnerEnvironment !== 'github-hosted' ||
    cert.runInvocationURI !==
      `${repo}/actions/runs/${context.runId}/attempts/${context.runAttempt}` ||
    typeof cert.buildSignerURI !== 'string' ||
    !cert.buildSignerURI.startsWith(signer) ||
    !cert.buildSignerURI.slice(signer.length).startsWith('refs/') ||
    cert.subjectAlternativeName !== cert.buildSignerURI ||
    !/^[a-f0-9]{40}$/.test(cert.buildSignerDigest ?? '') ||
    !Array.isArray(v.verifiedTimestamps) ||
    !v.verifiedTimestamps.length ||
    v.statement?.predicateType !== 'https://slsa.dev/provenance/v1' ||
    !Array.isArray(v.statement.subject) ||
    v.statement.subject.length !== 1 ||
    v.statement.subject[0]?.digest?.sha256 !== context.artifactSha256
  )
    throw Error('Attestation identity mismatch')
  return {
    ...context,
    issuer: cert.issuer as string,
    signerUri: cert.buildSignerURI as string,
    signerDigest: cert.buildSignerDigest as string,
    runnerEnvironment: 'github-hosted',
    predicateType: 'https://slsa.dev/provenance/v1',
  }
}
export type ProvenanceReceipt = {
  id: string
  bundle: Uint8Array
  bundleSha256: string
  policyDigest: string
  receiptHash: string
  claims: unknown
}
export function validatedProvenance(
  receipt: ProvenanceReceipt | undefined,
  context: Omit<AttestationContext, 'signerWorkflow'>,
) {
  if (!receipt) return null
  const policy = reportProofPolicy()
  const claims = receipt.claims as ReturnType<typeof attestationClaims> & {signerKeyId?:string}
  if (
    !claims ||
    typeof claims !== 'object' ||
    sha256(receipt.bundle) !== receipt.bundleSha256 ||
    digest({
      version: ATTESTATION_VERSION,
      bundleSha256: receipt.bundleSha256,
      policyDigest: receipt.policyDigest,
      claims,
    }) !== receipt.receiptHash ||
    Object.entries(context).some(
      ([k, v]) => claims[k as keyof typeof claims] !== v,
    )
  )
    return null
  if (
    !policy ||
    policy.digest !== receipt.policyDigest ||
    !policy.workflows.includes(claims.signerWorkflow) ||
    (policy.mode === 'organization-key' && !approvedOrganizationClaims(claims,policy)) ||
    (policy.mode === 'github-native' && claims.issuer !== 'https://token.actions.githubusercontent.com')
  )
    return null
  return {
    status: 'VERIFIED_ATTESTATION',
    proofSource: policy.mode,
    receiptId: receipt.id,
    receiptHash: receipt.receiptHash,
    bundleSha256: receipt.bundleSha256,
    policyDigest: receipt.policyDigest,
    signerWorkflow: claims.signerWorkflow,
    signerDigest: claims.signerDigest,
    runId: claims.runId,
    runAttempt: claims.runAttempt,
  }
}
