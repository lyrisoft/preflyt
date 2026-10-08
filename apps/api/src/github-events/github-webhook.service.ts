import { artifactSummarySelect } from './ci-artifact.service.js'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { currentTraceParent } from '../telemetry.js'
import { normalizeAccessEvent } from './github-access-event.js'
import { normalizeGitHubEvent } from './github-event.js'

@Injectable()
export class GitHubWebhookService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get enabled() {
    return (
      process.env.GITHUB_EVENTS_ENABLED === 'true' &&
      (process.env.GITHUB_WEBHOOK_SECRET?.length ?? 0) >= 32
    )
  }

  async receive(
    raw: Buffer | undefined,
    signature: string | undefined,
    deliveryId: string | undefined,
    event: string | undefined,
    body: unknown,
  ) {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        'GitHub webhook ingestion is not configured',
      )
    if (!raw || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature))
      throw new UnauthorizedException('GitHub webhook signature is invalid')
    const expected = createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
      .update(raw)
      .digest()
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex')))
      throw new UnauthorizedException('GitHub webhook signature is invalid')
    if (
      !deliveryId ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        deliveryId,
      ) ||
      !event ||
      event.length > 40
    )
      throw new BadRequestException('GitHub delivery headers are invalid')
    const access = normalizeAccessEvent(event, body)
    if (access)
      return this.receiveAccess(
        deliveryId.toLowerCase(),
        createHash('sha256').update(event).update(raw).digest('hex'),
        access,
      )
    const normalized = normalizeGitHubEvent(event, body)
    if (!normalized) return { accepted: false, reason: 'unsupported_event' }
    const id = deliveryId.toLowerCase()
    const payloadHash = createHash('sha256')
      .update(event)
      .update(raw)
      .digest('hex')
    const existing = await this.prisma.gitHubWebhookDelivery.findUnique({
      where: { id },
    })
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException('GitHub delivery identifier was reused')
      return { accepted: true, duplicate: true, deliveryId: id }
    }
    const repository = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: normalized.repositoryGithubId,
        installationId: normalized.installationId,
        selected: true,
        installation: { active: true },
      },
    })
    if (!repository)
      return { accepted: false, reason: 'repository_not_selected' }
    // PostgreSQL is the acceptance boundary. A worker reconciles this inbox into Redis.
    const created = await this.prisma.gitHubWebhookDelivery.createMany({
      data: [
        { id, payloadHash, traceParent: currentTraceParent(), ...normalized },
      ],
      skipDuplicates: true,
    })
    if (created.count === 0) {
      const duplicate =
        await this.prisma.gitHubWebhookDelivery.findUniqueOrThrow({
          where: { id },
        })
      if (duplicate.payloadHash !== payloadHash)
        throw new ConflictException('GitHub delivery identifier was reused')
    }
    return { accepted: true, duplicate: created.count === 0, deliveryId: id }
  }

  private async receiveAccess(
    id: string,
    payloadHash: string,
    access: NonNullable<ReturnType<typeof normalizeAccessEvent>>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the installation before inserting the unique inbox row; concurrent retries are serialized.
      const installation = await tx.gitHubInstallation.updateMany({
        where: { id: access.installationId },
        data: { accessRevision: { increment: 0 } },
      })
      if (!installation.count)
        return { accepted: false, reason: 'installation_not_connected' }
      const existing = await tx.gitHubAccessDelivery.findUnique({
        where: { id },
      })
      if (existing) {
        if (existing.payloadHash !== payloadHash)
          throw new ConflictException('GitHub delivery identifier was reused')
        return { accepted: true, duplicate: true, deliveryId: id }
      }
      const current = await tx.gitHubInstallation.findUniqueOrThrow({
        where: { id: access.installationId },
      })
      const pause =
        access.pauseInstallation ||
        (access.repositorySelection === 'selected' &&
          current.repositorySelection === 'all')
      await tx.gitHubAccessDelivery.create({
        data: {
          id,
          payloadHash,
          installationId: access.installationId,
          event: access.event,
          action: access.action,
        },
      })
      await tx.gitHubInstallation.update({
        where: { id: access.installationId },
        data: {
          accessRevision: { increment: 1 },
          syncLeaseUntil: null,
          ...(pause ? { active: false } : {}),
          syncState: 'PENDING',
        },
      })
      if (pause || access.removedIds.length)
        await tx.gitHubRepository.updateMany({
          where: {
            installationId: access.installationId,
            ...(pause ? {} : { githubId: { in: access.removedIds } }),
          },
          data: { selected: false, available: false },
        })
      await tx.auditEvent.create({
        data: {
          event: 'github_access_changed',
          actorId: null,
          metadata: {
            deliveryId: id,
            installationId: access.installationId.toString(),
            action: access.action,
            removedCount: access.removedIds.length,
          },
        },
      })
      return { accepted: true, duplicate: false, deliveryId: id }
    })
  }

  async evidence(repositoryId: string, sha?: string) {
    if (
      sha !== undefined &&
      (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha))
    )
      throw new BadRequestException('A full commit SHA is required')
    const repository = await this.selectedRepository(repositoryId)
    const observations = await this.prisma.importedCiEvidence.findMany({
      where: {
        repositoryGithubId: repository.githubId,
        installationId: repository.installationId,
        ...(sha === undefined ? {} : { sourceSha: sha.toLowerCase() }),
      },
      include: {
        artifacts: {
          select: artifactSummarySelect,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ observedAt: 'desc' }, { deliveryId: 'desc' }],
      take: 50,
    })
    return {
      enabled: this.enabled,
      source: 'github_signed_webhook',
      qualityGate: null,
      observations: observations.map(
        ({ repositoryGithubId, installationId, ...observation }) => ({
          ...observation,
          repositoryGithubId: repositoryGithubId.toString(),
          installationId: installationId.toString(),
        }),
      ),
    }
  }

  private async selectedRepository(repositoryId: string) {
    if (
      !/^[1-9][0-9]{0,15}$/.test(repositoryId) ||
      !Number.isSafeInteger(Number(repositoryId))
    )
      throw new ForbiddenException('Repository is unavailable')
    const repository = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(repositoryId),
        selected: true,
        installation: { active: true },
      },
    })
    if (!repository)
      throw new ForbiddenException(
        'Select an available repository to view events',
      )
    return repository
  }

  async list(repositoryId: string) {
    const repository = await this.selectedRepository(repositoryId)
    const deliveries = await this.prisma.gitHubWebhookDelivery.findMany({
      where: {
        repositoryGithubId: repository.githubId,
        installationId: repository.installationId,
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        event: true,
        action: true,
        sourceSha: true,
        sourceObjectId: true,
        sourceNumber: true,
        sourceStatus: true,
        sourceConclusion: true,
        sourceUpdatedAt: true,
        state: true,
        reason: true,
        receivedAt: true,
        processedAt: true,
      },
    })
    return { enabled: this.enabled, deliveries }
  }
}
