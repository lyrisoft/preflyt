import { createHash, createPublicKey } from 'node:crypto'
import { compactVerify, decodeProtectedHeader, importSPKI } from 'jose'
import { digest } from '../assessments/assessment-digest.js'
import type { AttestationContext } from './ci-attestation-policy.js'
export const ORGANIZATION_PROOF_FORMAT = 'preflyt.organization-report.v1'
type SignerKey = {
  kid: string
  algorithm: 'RS256' | 'ES256' | 'EdDSA'
  publicKeyPem: string
  repositoryIds: string[]
  workflows: { path: string; sha: string }[]
}
const workflowPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/
/** Public verification material only. Signing authority belongs to an isolated trusted CI service. */
export function organizationProofPolicy() {
  try {
    const raw = process.env.CI_ORGANIZATION_SIGNER_KEYS ?? ''
    if (raw.length > 128 * 1024) return null
    const keys = JSON.parse(raw) as SignerKey[]
    if (!Array.isArray(keys) || !keys.length || keys.length > 32 || new Set(keys.map(k => k.kid)).size !== keys.length) return null
    for (const key of keys) {
      if (!key || !/^[a-zA-Z0-9_-]{1,100}$/.test(key.kid) || !['RS256','ES256','EdDSA'].includes(key.algorithm) || typeof key.publicKeyPem !== 'string' || key.publicKeyPem.length > 8192 || !key.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----') || !Array.isArray(key.repositoryIds) || !key.repositoryIds.length || key.repositoryIds.length > 100 || key.repositoryIds.some(id => !/^[1-9][0-9]{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) || !Array.isArray(key.workflows) || !key.workflows.length || key.workflows.length > 100 || key.workflows.some(w => !w || !workflowPattern.test(w.path) || !/^[a-f0-9]{40}$/.test(w.sha))) return null
      const publicKey = createPublicKey(key.publicKeyPem)
      if (key.algorithm === 'RS256' && (publicKey.asymmetricKeyType !== 'rsa' || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)) return null
      if (key.algorithm === 'ES256' && (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1')) return null
      if (key.algorithm === 'EdDSA' && publicKey.asymmetricKeyType !== 'ed25519') return null
    }
    const normalized = keys.map(key => ({...key,repositoryIds:[...new Set(key.repositoryIds)].sort(),workflows:[...key.workflows].sort((a,b)=>a.path.localeCompare(b.path)||a.sha.localeCompare(b.sha))})).sort((a,b)=>a.kid.localeCompare(b.kid))
    return {mode:'organization-key' as const,keys:normalized,workflows:[...new Set(normalized.flatMap(k=>k.workflows.map(w=>w.path)))].sort(),digest:digest({version:1,mode:'organization-key',keys:normalized})}
  } catch {return null}
}
export function approvedOrganizationClaims(claims:Record<string,any>,policy:NonNullable<ReturnType<typeof organizationProofPolicy>>) {
  const key=policy.keys.find(k=>k.kid===claims.signerKeyId)
  return !!key && claims.issuer === 'preflyt:organization-key' && key.repositoryIds.includes(claims.repositoryId) && key.workflows.some(w=>w.path===claims.signerWorkflow && w.sha===claims.signerDigest) && claims.signerWorkflow.startsWith(claims.repositoryName+'/.github/workflows/') && claims.runnerEnvironment === 'github-hosted'
}
export async function verifyOrganizationReport(content:Uint8Array,bundle:Uint8Array,context:AttestationContext,policy:NonNullable<ReturnType<typeof organizationProofPolicy>>) {
  if (bundle.byteLength > 512 * 1024) throw Error('Proof limit')
  const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bundle))
  if (!envelope || envelope.format!==ORGANIZATION_PROOF_FORMAT || typeof envelope.signature!=='string' || Object.keys(envelope).sort().join(',')!=='format,signature' || envelope.signature.length > 32768) throw Error('Invalid proof format')
  const header=decodeProtectedHeader(envelope.signature)
  if (header.typ!==ORGANIZATION_PROOF_FORMAT || Object.keys(header).some(k=>!['typ','kid','alg'].includes(k))) throw Error('Unapproved signature header')
  const key=policy.keys.find(k=>k.kid===header.kid && k.algorithm===header.alg)
  if (!key) throw Error('Unknown signing key')
  const verified=await compactVerify(envelope.signature,await importSPKI(key.publicKeyPem,key.algorithm),{algorithms:[key.algorithm]})
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(verified.payload))
  if (!value || value.schemaVersion!==1 || typeof value.issuedAt!=='string' || !Number.isFinite(Date.parse(value.issuedAt)) || Date.parse(value.issuedAt)>Date.now()+300000 || Date.parse(value.issuedAt)<Date.now()-7*86400000 || value.subjectSha256!==context.artifactSha256 || createHash('sha256').update(content).digest('hex')!==context.artifactSha256 || value.repositoryId!==context.repositoryId || value.repositoryName!==context.repositoryName || value.sourceSha!==context.sourceSha || value.runId!==context.runId || value.runAttempt!==context.runAttempt || value.signerWorkflow!==context.signerWorkflow || !/^[a-f0-9]{40}$/.test(value.signerDigest) || value.runnerEnvironment!=='github-hosted') throw Error('Signed report identity mismatch')
  const claims={...context,issuer:'preflyt:organization-key',signerKeyId:key.kid,signerDigest:value.signerDigest as string,signerUri:`https://github.com/${context.signerWorkflow}@${value.signerDigest}`,runnerEnvironment:'github-hosted',predicateType:ORGANIZATION_PROOF_FORMAT,issuedAt:value.issuedAt as string}
  if (!approvedOrganizationClaims(claims,policy)) throw Error('Signer scope mismatch')
  return {claims,policyDigest:policy.digest}
}
