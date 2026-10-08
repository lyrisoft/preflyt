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
import type { ProfileSignal } from '../github/repository-profile.js'
import { buildAssessment, digest, type Mapping } from './assessment-plan.js'
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
    const normalized = {
      sourceSha: input.sourceSha.toLowerCase(),
      expectedSelectionId: input.expectedSelectionId,
      mappings: [...input.mappings].sort((a, b) =>
        a.ruleId < b.ruleId ? -1 : 1,
      ),
      actorId,
    }
    const inputHash = digest(normalized)
    return this.prisma.$transaction(async (tx) => {
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
      if (!snapshot && rows.length === 0)
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
      const at = new Date()
      let result
      try {
        result = buildAssessment({
          sourceSha: normalized.sourceSha,
          profile: selection.profile as AdoptionProfile,
          packs,
          signals,
          profileCreatedAt: snapshot?.createdAt ?? null,
          mappings: input.mappings,
          observations,
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
        organization: 'deployment',
        repositoryId: id,
        sourceSha: normalized.sourceSha,
        installationId: repo.installationId.toString(),
        subjectKind: 'COMMIT',
        baseContext: null,
        trigger: 'MANUAL',
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
        mappings: normalized.mappings,
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
          },
        },
      })
      return { assessment, duplicate: false }
    })
  }
}
