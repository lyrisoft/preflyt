import {
  freezeNativeEvidence,
  readLatestNativeEvidence,
} from '../execution/native-evidence.js'
import { recordAssessmentNotification } from '../notifications/notification-event.js'
import {
  reportProofPolicy,
  validatedProvenance,
} from '../github-events/ci-attestation-policy.js'
import { runAttempt } from './ci-binding.js'
import {
  validateObservation,
  validateReport,
  MAX_VALIDATION_ARTIFACTS,
  type ObservationValidation,
} from './evidence-validation.js'
import {
  readPullRequestContext,
  type PullRequestContext,
} from '../github-events/pull-request-context.js'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { artifactSummarySelect } from '../github-events/ci-artifact.service.js'
import {
  posture,
  type AdoptionProfile,
  type PackRef,
} from '../standards/catalogue.js'
import type {
  Prisma,
  GitHubRepository,
  GitHubWebhookDelivery,
} from '../generated/prisma/client.js'
import type { ProfileSignal } from '../github/repository-profile.js'
import { resolveBindings, type Binding } from './ci-binding.js'
import { buildAssessment, digest, type Mapping } from './assessment-plan.js'
type Trigger = {
  kind: 'MANUAL' | 'GITHUB_CI' | 'GITHUB_PR' | 'AUTOMATIC' | 'NATIVE'
  deliveryId: string | null
  pullRequest?: PullRequestContext & { number: number; objectId: string }
}
export type AssessmentInput = {
  sourceSha: string
  expectedSelectionId: string
  requestKey: string
  mappings: Mapping[]
}
@Injectable()
export class AssessmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async repository(id: string) {
    if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new ForbiddenException('Repository is unavailable')
    const repo = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(id),
        selected: true,
        available: true,
        installation: { active: true },
      },
    })
    if (!repo) throw new ForbiddenException('Repository is unavailable')
    return repo
  }
  private verify(record: {
    request: unknown
    plan: unknown
    report: unknown
    assessmentHash: string
  }) {
    if (
      digest({
        request: record.request,
        plan: record.plan,
        report: record.report,
      }) !== record.assessmentHash
    )
      throw new ConflictException('Assessment integrity check failed')
  }
  async list(id: string, sha?: string) {
    if (
      sha !== undefined &&
      (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha))
    )
      throw new BadRequestException('A full commit SHA is required')
    const repo = await this.repository(id)
    const assessments = await this.prisma.commitAssessment.findMany({
      where: {
        repositoryId: repo.id,
        ...(sha ? { sourceSha: sha.toLowerCase() } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        sourceSha: true,
        selectionId: true,
        assessmentHash: true,
        createdAt: true,
      },
    })
    return { assessments }
  }
  async get(id: string, assessmentId: string) {
    const repo = await this.repository(id)
    const assessment = await this.prisma.commitAssessment.findFirst({
      where: { id: assessmentId, repositoryId: repo.id },
    })
    if (!assessment) throw new NotFoundException('Assessment is unavailable')
    this.verify(assessment)
    return assessment
  }
  async create(id: string, input: AssessmentInput, actorId: string) {
    if (
      !/^[a-f0-9]{40}$/i.test(input.sourceSha) ||
      new Set(input.mappings.map((m) => m.ruleId)).size !==
        input.mappings.length
    )
      throw new BadRequestException(
        'Choose an exact SHA and at most one observation per rule',
      )
    const repo = await this.repository(id)
    return this.prisma.$transaction((tx) =>
      this.persist(tx, repo, id, input, actorId, {
        kind: 'MANUAL',
        deliveryId: null,
      }),
    )
  }

  async createAutomatic(
    id: string,
    sourceSha: string,
    selectionId: string,
    requestKey: string,
    actorId: string,
    pullRequest: NonNullable<Trigger['pullRequest']>,
  ) {
    const repo = await this.repository(id)
    return this.prisma.$transaction((tx) =>
      this.persist(
        tx,
        repo,
        id,
        {
          sourceSha,
          expectedSelectionId: selectionId,
          requestKey,
          mappings: [],
        },
        actorId,
        { kind: 'AUTOMATIC', deliveryId: null, pullRequest },
      ),
    )
  }

  /** Internal native completion produces a new immutable commit snapshot. */
  async createNative(
    id: string,
    sourceSha: string,
    selectionId: string,
    requestKey: string,
    actorId: string,
  ) {
    const repo = await this.repository(id)
    return this.prisma.$transaction((tx) =>
      this.persist(
        tx,
        repo,
        id,
        {
          sourceSha,
          expectedSelectionId: selectionId,
          requestKey,
          mappings: [],
        },
        actorId,
        { kind: 'NATIVE', deliveryId: null },
      ),
    )
  }
  /** Called inside the signed-delivery processor transaction; context never establishes current PR readiness. */
  async createForDelivery(
    tx: Prisma.TransactionClient,
    delivery: GitHubWebhookDelivery,
  ) {
    let pullRequest: Trigger['pullRequest']
    if (delivery.event === 'pull_request') {
      const context = readPullRequestContext(delivery.pullRequestContext)
      if (
        !context ||
        !delivery.sourceNumber ||
        context.head.sha !== delivery.sourceSha ||
        context.base.repositoryId !== delivery.repositoryGithubId.toString()
      )
        return { assessment: null, reason: 'pr_context_unavailable' }
      if (
        delivery.action === 'closed' ||
        context.state !== 'open' ||
        context.merged
      )
        return { assessment: null, reason: 'pr_not_open' }
      if (context.head.repositoryId !== context.base.repositoryId)
        return { assessment: null, reason: 'fork_head_not_supported' }
      pullRequest = {
        ...context,
        number: delivery.sourceNumber,
        objectId: delivery.sourceObjectId,
      }
    }
    const repo = await tx.gitHubRepository.findFirst({
      where: {
        githubId: delivery.repositoryGithubId,
        installationId: delivery.installationId,
        selected: true,
        available: true,
        installation: { active: true },
      },
    })
    if (!repo) throw new ForbiddenException('Repository access changed')
    const selection = await tx.repositoryStandardsSelection.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: 'desc' },
    })
    if (!selection) return { assessment: null, reason: 'standards_not_adopted' }
    const result = await this.persist(
      tx,
      repo,
      repo.githubId.toString(),
      {
        sourceSha: delivery.sourceSha,
        expectedSelectionId: selection.id,
        requestKey: `github:${delivery.id}`,
        mappings: [],
      },
      null,
      {
        kind: pullRequest ? 'GITHUB_PR' : 'GITHUB_CI',
        deliveryId: delivery.id,
        ...(pullRequest ? { pullRequest } : {}),
      },
    )
    return { assessment: result.assessment, reason: null }
  }

  private async persist(
    tx: Prisma.TransactionClient,
    repo: GitHubRepository,
    id: string,
    input: AssessmentInput,
    actorId: string | null,
    trigger: Trigger,
  ) {
    const normalized = {
      sourceSha: input.sourceSha.toLowerCase(),
      expectedSelectionId: input.expectedSelectionId,
      mappings: [...input.mappings].sort((a, b) =>
        a.ruleId < b.ruleId ? -1 : 1,
      ),
      actorId,
      // Preserve the original manual idempotency projection across worker upgrades.
      ...(trigger.kind === 'MANUAL' ? {} : { trigger }),
    }
    const inputHash = digest(normalized)

    if (
      !(
        await tx.gitHubInstallation.updateMany({
          where: { id: repo.installationId, active: true },
          data: { active: true },
        })
      ).count ||
      !(
        await tx.gitHubRepository.updateMany({
          where: {
            id: repo.id,
            installationId: repo.installationId,
            selected: true,
            available: true,
          },
          data: { selected: true },
        })
      ).count
    )
      throw new ForbiddenException('Repository access changed')
    const existing = await tx.commitAssessment.findUnique({
      where: {
        repositoryId_requestKey: {
          repositoryId: repo.id,
          requestKey: input.requestKey.toLowerCase(),
        },
      },
    })
    if (existing) {
      this.verify(existing)
      if (existing.inputHash !== inputHash)
        throw new ConflictException(
          'Request key was reused with different inputs',
        )
      return { assessment: existing, duplicate: true }
    }
    const selection = await tx.repositoryStandardsSelection.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: 'desc' },
    })
    if (!selection || selection.id !== input.expectedSelectionId)
      throw new ConflictException(
        'Save or reload the current standards selection first',
      )
    const packs = selection.packs as unknown as (PackRef & {
      digest: string
    })[]
    const snapshot = await tx.repositoryProfile.findFirst({
      where: { repositoryId: repo.id, sourceSha: normalized.sourceSha },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    const rows = await tx.importedCiEvidence.findMany({
      where: {
        repositoryGithubId: repo.githubId,
        installationId: repo.installationId,
        sourceSha: normalized.sourceSha,
      },
      orderBy: [{ observedAt: 'desc' }, { deliveryId: 'desc' }],
      take: 101,
      include: {
        artifacts: {
          select: artifactSummarySelect,
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!snapshot && rows.length === 0 && trigger.kind !== 'GITHUB_PR')
      throw new NotFoundException(
        'No pinned profile or imported CI evidence exists for this commit',
      )
    const signals =
      (snapshot?.report as { signals?: ProfileSignal[] } | undefined)
        ?.signals ?? []
    let controls
    try {
      controls = posture(packs, selection.profile as AdoptionProfile, signals)
    } catch {
      throw new ConflictException('Selected pack definitions are unavailable')
    }
    const observations = rows.slice(0, 100)
    // A delayed delivery must remain in its own report even beyond the latest-100 window.
    if (
      trigger.kind === 'GITHUB_CI' &&
      trigger.deliveryId &&
      !observations.some((row) => row.deliveryId === trigger.deliveryId)
    ) {
      const triggering = await tx.importedCiEvidence.findFirst({
        where: {
          deliveryId: trigger.deliveryId,
          repositoryGithubId: repo.githubId,
          installationId: repo.installationId,
          sourceSha: normalized.sourceSha,
        },
        include: {
          artifacts: {
            select: artifactSummarySelect,
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (!triggering)
        throw new ConflictException('Triggering CI evidence is unavailable')
      if (observations.length === 100) observations.pop()
      observations.push(triggering)
    }
    if (
      input.mappings.some(
        (m) =>
          !controls.some((c) => c.id === m.ruleId) ||
          !observations.some((o) => o.deliveryId === m.deliveryId),
      )
    )
      throw new BadRequestException(
        'Mappings must reference selected rules and collected evidence from this exact repository commit',
      )
    const binding = await tx.repositoryCiBindings.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: 'desc' },
    })
    const bindingActive = binding?.selectionId === selection.id
    const approved = bindingActive
      ? rows.length > 100
        ? {
            mappings: [],
            ambiguousRules: (binding!.bindings as unknown as Binding[]).map(
              (b) => b.ruleId,
            ),
          }
        : resolveBindings(
            binding!.bindings as unknown as Binding[],
            observations,
          )
      : { mappings: [], ambiguousRules: [] }
    const manualRules = new Set(input.mappings.map((m) => m.ruleId))
    const mappings = [
      ...input.mappings,
      ...approved.mappings.filter((m) => !manualRules.has(m.ruleId)),
    ]
    const mappedIds = [...new Set(mappings.map((m) => m.deliveryId))]
    const deliveries = await tx.gitHubWebhookDelivery.findMany({
      where: {
        id: { in: mappedIds },
        repositoryGithubId: repo.githubId,
        installationId: repo.installationId,
      },
    })
    const artifacts = await tx.ciArtifactImport.findMany({
      where: { deliveryId: { in: mappedIds } },
      orderBy: [{ deliveryId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_VALIDATION_ARTIFACTS + 1,
    })
    const validationCollectionTruncated =
      artifacts.length > MAX_VALIDATION_ARTIFACTS
    const receipts = await tx.ciArtifactAttestation.findMany({
      where: {
        artifactId: {
          in: artifacts.slice(0, MAX_VALIDATION_ARTIFACTS).map((a) => a.id),
        },
        policyDigest: reportProofPolicy()?.digest ?? '',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_VALIDATION_ARTIFACTS,
    })
    const validations = new Map<string, ObservationValidation>()
    for (const row of observations.filter((o) =>
      mappedIds.includes(o.deliveryId),
    ))
      validations.set(row.deliveryId, {
        observationIntegrity: validateObservation(
          row,
          deliveries.find((d) => d.id === row.deliveryId),
        ),
        reports: artifacts
          .slice(0, MAX_VALIDATION_ARTIFACTS)
          .filter((a) => a.deliveryId === row.deliveryId)
          .map((a) =>
            validateReport({
              ...a,
              provenance: validatedProvenance(
                receipts.find((r) => r.artifactId === a.id),
                {
                  artifactId: a.id,
                  artifactSha256: a.sha256,
                  repositoryId: repo.githubId.toString(),
                  repositoryName: repo.fullName,
                  sourceSha: row.sourceSha,
                  runId: row.sourceObjectId,
                  runAttempt: runAttempt(row.sourceIdentity),
                },
              ),
            }),
          ),
      })
    const installation = await tx.gitHubInstallation.findUnique({
      where: { id: repo.installationId },
      select: { organizationId: true },
    })
    // Latest per supported rule avoids dropping a newer blocked/cancelled attempt from the evidence window.
    const nativeRows = installation?.organizationId
      ? await readLatestNativeEvidence(tx, {
          repositoryId: repo.id,
          organizationId: installation.organizationId,
          sourceSha: normalized.sourceSha,
          selectionId: selection.id,
        })
      : []
    const nativeExecutions = nativeRows.map(freezeNativeEvidence)
    const at = new Date()
    let result
    try {
      result = buildAssessment({
        sourceSha: normalized.sourceSha,
        nativeExecutions,
        profile: selection.profile as AdoptionProfile,
        packs,
        signals,
        profileCreatedAt: snapshot?.createdAt ?? null,
        mappings,
        ambiguousRules: approved.ambiguousRules.filter(
          (id) => !manualRules.has(id),
        ),
        observations,
        validations,
        validationCollectionTruncated,
        at,
        truncated: rows.length > 100,
      })
    } catch {
      throw new ConflictException(
        'Selected pack definitions are unavailable or their integrity changed',
      )
    }
    const request = {
      version: 1,
      organization: installation?.organizationId ?? 'deployment',
      repositoryId: id,
      sourceSha: normalized.sourceSha,
      installationId: repo.installationId.toString(),
      subjectKind: trigger.pullRequest ? 'PULL_REQUEST' : 'COMMIT',
      baseContext: trigger.pullRequest?.base ?? null,
      ...(trigger.pullRequest ? { pullRequest: trigger.pullRequest } : {}),
      trigger: trigger.kind,
      sourceDeliveryId: trigger.deliveryId,
      actorId,
      selectionId: selection.id,
      selectionRevision: selection.revision,
      profileSnapshotId: snapshot?.id ?? null,
      profileSnapshot: snapshot
        ? {
            id: snapshot.id,
            sourceSha: snapshot.sourceSha,
            treeSha: snapshot.treeSha,
            version: snapshot.version,
            complete: snapshot.complete,
            createdAt: snapshot.createdAt.toISOString(),
          }
        : null,
      mappings,
      sourceBindings: bindingActive
        ? {
            id: binding!.id,
            revision: binding!.revision,
            selectionId: binding!.selectionId,
            bindings: binding!.bindings,
          }
        : null,
      requestedAt: at.toISOString(),
    }
    const assessmentHash = digest({
      request,
      plan: result.plan,
      report: result.report,
    })
    const assessment = await tx.commitAssessment.create({
      data: {
        repositoryId: repo.id,
        sourceSha: normalized.sourceSha,
        selectionId: selection.id,
        requestKey: input.requestKey.toLowerCase(),
        inputHash,
        request,
        plan: JSON.parse(JSON.stringify(result.plan)),
        report: JSON.parse(JSON.stringify(result.report)),
        assessmentHash,
      },
    })
    await tx.auditEvent.create({
      data: {
        event: 'assessment.created',
        actorId,
        metadata: {
          assessmentId: assessment.id,
          repositoryId: id,
          sourceSha: normalized.sourceSha,
          selectionId: selection.id,
          assessmentHash,
          mappingTrust: 'ADMIN_ASSOCIATED_UNVERIFIED',
          qualityGate: null,
          trigger: trigger.kind,
          sourceDeliveryId: trigger.deliveryId,
        },
      },
    })
    await recordAssessmentNotification(tx, assessment, repo, actorId)
    return { assessment, duplicate: false }
  }
}
