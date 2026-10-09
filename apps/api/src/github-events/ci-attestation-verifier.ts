import { organizationProofPolicy, verifyOrganizationReport } from './organization-report-proof.js'
import {
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
  HttpException,
} from '@nestjs/common'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  attestationPolicy,
  attestationClaims,
  sha256,
  type AttestationContext,
} from './ci-attestation-policy.js'
const run = promisify(execFile)
@Injectable()
export class CiAttestationVerifier {
  private busy = false
  async verify(
    content: Uint8Array,
    bundle: Uint8Array,
    context: AttestationContext,
  ) {
    if (process.env.CI_REPORT_PROOF_MODE === 'organization-key') {
      const policy=organizationProofPolicy()
      if(!policy)throw new ServiceUnavailableException('Organization report signature verification is not configured')
      if(this.busy)throw new HttpException('Report signature verifier is busy; retry later',429)
      this.busy=true
      try {return await verifyOrganizationReport(content,bundle,context,policy)}
      catch {throw new BadRequestException('Report signature could not be verified against the approved repository, commit and workflow run')}
      finally {this.busy=false}
    }
    if (process.env.CI_REPORT_PROOF_MODE && process.env.CI_REPORT_PROOF_MODE !== 'github-native') throw new ServiceUnavailableException('Unknown report signature verification mode')
    const policy = attestationPolicy()
    if (!policy)
      throw new ServiceUnavailableException(
        'CI attestation verification is not configured',
      )
    if (!policy.workflows.includes(context.signerWorkflow))
      throw new BadRequestException('Signer workflow is not approved')
    if (this.busy)
      throw new HttpException('Attestation verifier is busy; retry later', 429)
    this.busy = true
    let dir: string | undefined
    try {
      const root = await readFile(policy.root)
      if (
        root.length > 1024 * 1024 ||
        sha256(root) !== policy.rootDigest ||
        sha256(await readFile(policy.binary)) !== policy.binaryDigest
      )
        throw new ServiceUnavailableException(
          'Pinned attestation verifier or trust root changed',
        )
      dir = await mkdtemp(join(tmpdir(), 'preflyt-attestation-'))
      await writeFile(join(dir, 'report'), content, { mode: 0o600 })
      await writeFile(join(dir, 'bundle.json'), bundle, { mode: 0o600 })
      await writeFile(join(dir, 'root.json'), root, { mode: 0o600 })
      const { stdout } = await run(
        policy.binary,
        [
          'attestation',
          'verify',
          join(dir, 'report'),
          '--bundle',
          join(dir, 'bundle.json'),
          '--custom-trusted-root',
          join(dir, 'root.json'),
          '--repo',
          context.repositoryName,
          '--signer-workflow',
          context.signerWorkflow,
          '--source-digest',
          context.sourceSha,
          '--cert-oidc-issuer',
          'https://token.actions.githubusercontent.com',
          '--deny-self-hosted-runners',
          '--predicate-type',
          policy.predicateType,
          '--hostname',
          'github.com',
          '--format',
          'json',
        ],
        {
          timeout: 15000,
          maxBuffer: 2 * 1024 * 1024,
          cwd: dir,
          env: {
            PATH: process.env.PATH ?? '',
            GH_CONFIG_DIR: dir,
            GH_PROMPT_DISABLED: '1',
            HTTP_PROXY: 'http://127.0.0.1:9',
            HTTPS_PROXY: 'http://127.0.0.1:9',
            ALL_PROXY: 'http://127.0.0.1:9',
            NO_PROXY: '',
            NO_COLOR: '1',
          },
        },
      )
      return {
        claims: attestationClaims(JSON.parse(stdout), context),
        policyDigest: policy.digest,
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      // Never expose raw bundle content, verifier stderr, paths or process environment.
      throw new BadRequestException(
        'Attestation could not be cryptographically verified against the approved CI identity',
      )
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true })
      this.busy = false
    }
  }
}
