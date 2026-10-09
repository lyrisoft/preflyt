import { generateKeyPairSync } from 'node:crypto'
import { CompactSign, importPKCS8 } from 'jose'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { organizationProofPolicy, verifyOrganizationReport, ORGANIZATION_PROOF_FORMAT } from '../src/github-events/organization-report-proof.js'
import { reportProofPolicy, validatedProvenance, sha256 } from '../src/github-events/ci-attestation-policy.js'
import { CiAttestationVerifier } from '../src/github-events/ci-attestation-verifier.js'
import { digest } from '../src/assessments/assessment-digest.js'
const pair=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
const content=Buffer.from('<testsuite/>')
const context={artifactId:'artifact',artifactSha256:sha256(content),repositoryId:'501',repositoryName:'fixture/app',sourceSha:'a'.repeat(40),runId:'42',runAttempt:1,signerWorkflow:'fixture/app/.github/workflows/ci.yml'}
const key={kid:'ci-2026',algorithm:'RS256',publicKeyPem:pair.publicKey,repositoryIds:['501'],workflows:[{path:context.signerWorkflow,sha:'b'.repeat(40)}]}
const payload=()=>({schemaVersion:1,subjectSha256:context.artifactSha256,repositoryId:context.repositoryId,repositoryName:context.repositoryName,sourceSha:context.sourceSha,runId:context.runId,runAttempt:context.runAttempt,signerWorkflow:context.signerWorkflow,signerDigest:'b'.repeat(40),runnerEnvironment:'github-hosted',issuedAt:new Date().toISOString()})
async function signed(value=payload(),header:Record<string,any>={alg:'RS256',kid:key.kid,typ:ORGANIZATION_PROOF_FORMAT}) {
 const signature=await new CompactSign(Buffer.from(JSON.stringify(value))).setProtectedHeader(header as any).sign(await importPKCS8(pair.privateKey,'RS256'))
 return Buffer.from(JSON.stringify({format:ORGANIZATION_PROOF_FORMAT,signature}))
}
beforeEach(()=>{vi.stubEnv('CI_REPORT_PROOF_MODE','organization-key');vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS',JSON.stringify([key]))})
afterEach(()=>vi.unstubAllEnvs())
it('verifies actual RSA signatures offline without GitHub Enterprise or private keys on the API',async()=>{
 const proof=await new CiAttestationVerifier().verify(content,await signed(),context)
 expect(proof.claims).toMatchObject({issuer:'preflyt:organization-key',signerKeyId:key.kid,runId:'42',runAttempt:1,signerDigest:'b'.repeat(40)})
 expect(proof.policyDigest).toBe(reportProofPolicy()!.digest)
})
it.each([{sourceSha:'c'.repeat(40)},{repositoryId:'502'},{repositoryName:'fixture/other'},{runId:'43'},{runAttempt:2},{subjectSha256:'0'.repeat(64)},{signerDigest:'c'.repeat(40)},{runnerEnvironment:'self-hosted'},{issuedAt:'invalid'},{issuedAt:'2020-01-01T00:00:00Z'}])('rejects signed but mismatched/replayed claims %j',async change=>{
 await expect(verifyOrganizationReport(content,await signed({...payload(),...change}),context,organizationProofPolicy()!)).rejects.toThrow()
})
it('rejects future signing timestamps and altered report bytes',async()=>{
 await expect(verifyOrganizationReport(content,await signed({...payload(),issuedAt:new Date(Date.now()+3600000).toISOString()}),context,organizationProofPolicy()!)).rejects.toThrow()
 await expect(verifyOrganizationReport(Buffer.from('tampered'),await signed(),context,organizationProofPolicy()!)).rejects.toThrow()
})
it('rejects signature tampering and remote/embedded signing keys',async()=>{
 const bundle=JSON.parse((await signed()).toString());const parts=bundle.signature.split('.');parts[1]=Buffer.from(JSON.stringify({...payload(),runId:'99'})).toString('base64url');bundle.signature=parts.join('.')
 await expect(verifyOrganizationReport(content,Buffer.from(JSON.stringify(bundle)),context,organizationProofPolicy()!)).rejects.toThrow()
 await expect(verifyOrganizationReport(content,await signed(payload(),{alg:'RS256',kid:key.kid,typ:ORGANIZATION_PROOF_FORMAT,jku:'https://attacker.test/keys'}),context,organizationProofPolicy()!)).rejects.toThrow()
 await expect(verifyOrganizationReport(content,await signed(payload(),{alg:'RS256',kid:'unknown',typ:ORGANIZATION_PROOF_FORMAT}),context,organizationProofPolicy()!)).rejects.toThrow()
})
it('refuses cross-repository key scopes and private/weak verification key configuration',async()=>{
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS',JSON.stringify([{...key,repositoryIds:['999']}]))
 await expect(verifyOrganizationReport(content,await signed(),context,organizationProofPolicy()!)).rejects.toThrow()
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS',JSON.stringify([{...key,publicKeyPem:pair.privateKey}]))
 expect(organizationProofPolicy()).toBeNull()
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS',JSON.stringify([{...key,algorithm:'HS256'}]))
 expect(organizationProofPolicy()).toBeNull()
})
it('revalidates stored receipts against current key policy, revocation and report identity',async()=>{
 const bundle=await signed();const proof=await verifyOrganizationReport(content,bundle,context,organizationProofPolicy()!);const bundleSha256=sha256(bundle)
 const receipt={id:'receipt',bundle,bundleSha256,policyDigest:proof.policyDigest,claims:proof.claims,receiptHash:digest({version:1,bundleSha256,policyDigest:proof.policyDigest,claims:proof.claims})}
 expect(validatedProvenance(receipt,context)).toMatchObject({status:'VERIFIED_ATTESTATION',proofSource:'organization-key'})
 expect(validatedProvenance(receipt,{...context,runAttempt:2})).toBeNull()
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS','[]');expect(validatedProvenance(receipt,context)).toBeNull()
})
it('never falls back to native verification on malformed configuration or unknown modes',async()=>{
 vi.stubEnv('CI_ORGANIZATION_SIGNER_KEYS','bad');expect(reportProofPolicy()).toBeNull()
 await expect(new CiAttestationVerifier().verify(content,await signed(),context)).rejects.toThrow('not configured')
 vi.stubEnv('CI_REPORT_PROOF_MODE','unsafe');expect(reportProofPolicy()).toBeNull()
 await expect(new CiAttestationVerifier().verify(content,await signed(),context)).rejects.toThrow('Unknown')
})
