import {
  Injectable,
  Inject,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { CiAttestationVerifier } from './ci-attestation-verifier.js'
import {
  ATTESTATION_VERSION,
  MAX_BUNDLE_BYTES,
  attestationPolicy,
  sha256,
  validatedProvenance,
} from './ci-attestation-policy.js'
import {
  validateObservation,
  validateReport,
} from '../assessments/evidence-validation.js'
import { digest } from '../assessments/assessment-digest.js'
import {
  runAttempt,
  identityMatches,
  type Binding,
} from '../assessments/ci-binding.js'
@Injectable()
export class CiAttestationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CiAttestationVerifier)
    private readonly verifier: CiAttestationVerifier,
  ) {}
  private async context(
    repositoryId: string,
    deliveryId: string,
    artifactId: string,
    db = this.prisma,
  ) {
    if (
      !/^[1-9][0-9]{0,15}$/.test(repositoryId) ||
      !Number.isSafeInteger(Number(repositoryId))
    )
      throw new ForbiddenException('Repository is unavailable')
    const repository = await db.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(repositoryId),
        selected: true,
        available: true,
        installation: { active: true },
      },
    })
    if (!repository) throw new ForbiddenException('Repository is unavailable')
    const evidence = await db.importedCiEvidence.findFirst({
      where: {
        deliveryId,
        repositoryGithubId: repository.githubId,
        installationId: repository.installationId,
      },
    })
    const artifact = await db.ciArtifactImport.findFirst({
      where: { id: artifactId, deliveryId },
    })
    if (!evidence || !artifact)
      throw new NotFoundException('CI report is unavailable')
    const delivery = await db.gitHubWebhookDelivery.findUnique({
      where: { id: deliveryId },
    })
    if (
      !validateObservation(evidence, delivery ?? undefined) ||
      validateReport(artifact).integrity !== 'VALID'
    )
      throw new ConflictException(
        'CI observation or report integrity is invalid',
      )
    return { repository, evidence, artifact }
  }
  async get(repositoryId: string, deliveryId: string, artifactId: string) {
    const { repository, evidence, artifact } = await this.context(
      repositoryId,
      deliveryId,
      artifactId,
    )
    const receipt = await this.prisma.ciArtifactAttestation.findFirst({
      where: { artifactId, policyDigest: attestationPolicy()?.digest ?? '' },
      orderBy: { createdAt: 'desc' },
    })
    const provenance = validatedProvenance(receipt ?? undefined, {
      artifactId,
      artifactSha256: artifact.sha256,
      repositoryId,
      repositoryName: repository.fullName,
      sourceSha: evidence.sourceSha,
      runId: evidence.sourceObjectId,
      runAttempt: runAttempt(evidence.sourceIdentity),
    })
    return {
      configured: !!attestationPolicy(),
      provenance,
      executionTrusted: false,
    }
  }
  async verify(
    repositoryId: string,
    deliveryId: string,
    artifactId: string,
    body: { bundle: string; signerWorkflow: string },
    actorId: string,
  ) {
    const bundle = Buffer.from(body.bundle, 'utf8')
    if (!bundle.length || bundle.length > MAX_BUNDLE_BYTES)
      throw new BadRequestException('Attestation bundle exceeds limits')
    try {
      const json = JSON.parse(body.bundle)
      if (!json || Array.isArray(json) || typeof json !== 'object')
        throw Error()
    } catch {
      throw new BadRequestException('A single JSON Sigstore bundle is required')
    }
    const before = await this.context(repositoryId, deliveryId, artifactId)
    const { repository, evidence, artifact } = before
    if (
      evidence.sourceKind !== 'workflow_run' ||
      evidence.sourceStatus !== 'completed' ||
      evidence.sourceAction !== 'completed' ||
      !runAttempt(evidence.sourceIdentity)
    )
      throw new BadRequestException(
        'A completed workflow observation with a run attempt is required',
      )
    if (
      !body.signerWorkflow.startsWith(
        repository.fullName + '/.github/workflows/',
      )
    )
      throw new BadRequestException(
        'Same-repository signer workflow is required',
      )
    const approved = async (db: any) => {
      const selection = await db.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repository.id },
        orderBy: { revision: 'desc' },
      })
      const binding = await db.repositoryCiBindings.findFirst({
        where: { repositoryId: repository.id },
        orderBy: { revision: 'desc' },
      })
      if (
        !binding ||
        !selection ||
        binding.selectionId !== selection.id ||
        !(binding.bindings as Binding[]).some(
          (b) =>
            b.kind === 'workflow_run' &&
            identityMatches(b, evidence.sourceIdentity),
        )
      )
        throw new ConflictException(
          'An active approved workflow source binding is required',
        )
    }
    await approved(this.prisma)
    const context = {
      artifactId,
      artifactSha256: artifact.sha256,
      repositoryId,
      repositoryName: repository.fullName,
      sourceSha: evidence.sourceSha,
      runId: evidence.sourceObjectId,
      runAttempt: runAttempt(evidence.sourceIdentity),
      signerWorkflow: body.signerWorkflow,
    }
    const proof = await this.verifier.verify(artifact.content, bundle, context)
    if (
      !attestationPolicy() ||
      proof.policyDigest !== attestationPolicy()!.digest
    )
      throw new ConflictException('Attestation policy changed; retry')
    const bundleSha256 = sha256(bundle)
    const receiptHash = digest({
      version: ATTESTATION_VERSION,
      bundleSha256,
      policyDigest: proof.policyDigest,
      claims: proof.claims,
    })
    return this.prisma.$transaction(async (tx) => {
      if (
        !(
          await tx.gitHubInstallation.updateMany({
            where: { id: repository.installationId, active: true },
            data: { active: true },
          })
        ).count ||
        !(
          await tx.gitHubRepository.updateMany({
            where: {
              id: repository.id,
              installationId: repository.installationId,
              selected: true,
              available: true,
            },
            data: { selected: true },
          })
        ).count
      )
        throw new ForbiddenException('Repository is unavailable')
      await tx.$queryRaw`SELECT "id" FROM "CiArtifactImport" WHERE "id" = ${artifactId} FOR UPDATE`
      const current = await this.context(
        repositoryId,
        deliveryId,
        artifactId,
        tx as any,
      )
      if (
        current.evidence.evidenceHash !== evidence.evidenceHash ||
        sha256(current.artifact.content) !== context.artifactSha256 ||
        current.repository.fullName !== repository.fullName
      )
        throw new ConflictException('CI evidence changed during verification')
      await approved(tx)
      const existing = await tx.ciArtifactAttestation.findUnique({
        where: {
          artifactId_policyDigest: {
            artifactId,
            policyDigest: proof.policyDigest,
          },
        },
      })
      if (existing)
        return {
          provenance: validatedProvenance(existing, context),
          duplicate: true,
          executionTrusted: false,
        }
      if (
        (await tx.ciArtifactAttestation.count({ where: { artifactId } })) >= 5
      )
        throw new HttpException('Report attestation limit reached', 429)
      const receipt = await tx.ciArtifactAttestation.create({
        data: {
          artifactId,
          bundle,
          bundleSha256,
          policyDigest: proof.policyDigest,
          receiptHash,
          claims: proof.claims,
          verifiedById: actorId,
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'ci.artifact.provenance.verified',
          actorId,
          metadata: {
            artifactId,
            deliveryId,
            repositoryId,
            bundleSha256,
            policyDigest: proof.policyDigest,
            receiptHash,
          },
        },
      })
      return {
        provenance: validatedProvenance(receipt, context),
        duplicate: false,
        executionTrusted: false,
      }
    })
  }
}
