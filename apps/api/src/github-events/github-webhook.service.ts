import { readPageSize } from '../pagination.js'
import { isPreflytFeedback } from './preflyt-feedback.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import { normalizeContributorEvent } from './contributor-event.js'
import { captureContributors } from '../contributors/capture.js'
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
      configurationValue('GITHUB_EVENTS_ENABLED') === 'true' &&
      (configurationValue('GITHUB_WEBHOOK_SECRET')?.length ?? 0) >= 32
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
    const expected = createHmac('sha256', configurationValue('GITHUB_WEBHOOK_SECRET')!)
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
    if (event === 'github_app_authorization') {
      const payload = body as { action?: unknown; sender?: { id?: unknown } }
      if (payload?.action !== 'revoked' || !Number.isSafeInteger(payload.sender?.id) || Number(payload.sender?.id) < 1)
        throw new BadRequestException('Invalid GitHub authorization revocation event')
      const userId = BigInt(Number(payload.sender!.id))
      const hash = createHash('sha256').update(event).update(raw).digest('hex')
      const id = `github-user-revocation:${deliveryId.toLowerCase()}`
      return this.prisma.$transaction(async tx => {
        const account = await tx.gitHubUserAccount.findUnique({ where: { host_githubUserId: { host: 'github.com', githubUserId: userId } } })
        if (account) await tx.$queryRaw`SELECT "id" FROM "GitHubUserAccount" WHERE "id" = ${account.id} FOR UPDATE`
        const inserted = await tx.auditEvent.createMany({ data: [{ id, event: 'github.user_authorization_revoked', actorId: null,
          metadata: { deliveryId: deliveryId.toLowerCase(), payloadHash: hash, githubUserId: userId.toString(), accountId: account?.id ?? null } }], skipDuplicates: true })
        if (!inserted.count) {
          const prior = await tx.auditEvent.findUniqueOrThrow({ where: { id } })
          if ((prior.metadata as { payloadHash?: string }).payloadHash !== hash) throw new ConflictException('GitHub delivery identifier was reused')
          return { accepted: true, duplicate: true, deliveryId: deliveryId.toLowerCase() }
        }
        if (account) {
          // Deleting the locked credential waits for any in-flight rotation; access
          // evidence and pending provider-link challenges are invalidated together.
          await tx.gitHubUserCredential.deleteMany({ where: { accountId: account.id } })
          await tx.gitHubUserAccessEvidence.deleteMany({ where: { accountId: account.id } })
          await tx.gitHubOnboardingChallenge.deleteMany({ where: { accountId: account.id } })
        }
        return { accepted: true, duplicate: false, deliveryId: deliveryId.toLowerCase() }
      })
    }
    // Provider relationship changes invalidate authority, never grant it from
    // webhook payloads. A fresh bounded provider read owns reconciliation.
    if (['membership', 'organization', 'team', 'member'].includes(event)) {
      const payload = body as {action?: string; installation?: {id?: number}; organization?: {id?: number}; team?: {id?: number}};
      const supported: Record<string, string[]> = {
        membership: ['added', 'removed'], organization: ['member_added', 'member_removed', 'member_invited', 'renamed', 'deleted'],
        team: ['created', 'edited', 'deleted', 'added_to_repository', 'removed_from_repository'], member: ['added', 'removed', 'edited'],
      };
      if (!supported[event].includes(payload?.action ?? '')) return {accepted: false, reason: 'unsupported_action'};
      if (!Number.isSafeInteger(payload.installation?.id) || Number(payload.installation?.id) < 1 || !Number.isSafeInteger(payload.organization?.id) || Number(payload.organization?.id) < 1) throw new BadRequestException('Invalid GitHub organization relationship event');
      const payloadHash = createHash('sha256').update(event).update(raw).digest('hex');
      const receiptId = `github-directory-change:${deliveryId.toLowerCase()}`;
      return this.prisma.$transaction(async tx => {
        const installationId = BigInt(payload.installation!.id!);
        const installation = await tx.gitHubInstallation.findUnique({where: {id: installationId}});
        if (!installation) return {accepted: false, reason: 'installation_not_connected'};
        const link = await tx.gitHubOrganizationLink.findUnique({where: {organizationId: installation.organizationId}});
        if (!link || link.githubOrganizationId !== BigInt(payload.organization!.id!)) return {accepted: false, reason: 'organization_not_linked'};
        await tx.$queryRaw`SELECT "id" FROM "GitHubInstallation" WHERE "id" = ${installationId} FOR UPDATE`;
        const inserted = await tx.auditEvent.createMany({data: [{id: receiptId, event: 'github.directory_relationship_changed', actorId: null, metadata: {organizationId: installation.organizationId, installationId: installationId.toString(), deliveryId: deliveryId.toLowerCase(), payloadHash, providerEvent: event, action: payload.action!}}], skipDuplicates: true});
        if (!inserted.count) {
          const prior = await tx.auditEvent.findUniqueOrThrow({where: {id: receiptId}});
          if ((prior.metadata as {payloadHash?: string}).payloadHash !== payloadHash) throw new ConflictException('GitHub delivery identifier was reused');
          return {accepted: true, duplicate: true, deliveryId: deliveryId.toLowerCase()};
        }
        await tx.gitHubInstallation.update({where: {id: installationId}, data: {accessRevision: {increment: 1}, ...(event === 'organization' && payload.action === 'deleted' ? {active: false} : {})}});
        await tx.gitHubUserAccessEvidence.deleteMany({where: {organizationId: installation.organizationId}});
        await tx.preflytTeam.updateMany({where: {organizationId: installation.organizationId, installationId, source: 'GITHUB'}, data: {syncState: 'STALE', syncedAt: null}});
        return {accepted: true, duplicate: false, deliveryId: deliveryId.toLowerCase()};
      });
    }
    // Repository webhooks omit App installation metadata. After verifying the
    // original signed bytes, bind only supported CI/PR events to an existing,
    // selected repository connection. Never create or grant access from a hook.
    if (
      ['pull_request', 'workflow_run', 'check_run'].includes(event) &&
      body && typeof body === 'object' && !Array.isArray(body) &&
      !Object.hasOwn(body, 'installation')
    ) {
      const payload = body as { repository?: { id?: unknown; full_name?: unknown; owner?: { login?: unknown } } }
      const identity = payload.repository
      if (!Number.isSafeInteger(identity?.id) || Number(identity?.id) < 1 ||
        typeof identity?.full_name !== 'string' || typeof identity?.owner?.login !== 'string')
        throw new BadRequestException('Repository webhook identity is invalid')
      const connection = await this.prisma.gitHubRepository.findFirst({
        where: { githubId: BigInt(Number(identity.id)), selected: true, available: true,
          installation: { active: true } },
        select: { installationId: true, fullName: true, ownerLogin: true },
      })
      if (!connection) return { accepted: false, reason: 'repository_not_selected' }
      if (connection.fullName.toLowerCase() !== identity.full_name.toLowerCase() ||
        connection.ownerLogin.toLowerCase() !== identity.owner.login.toLowerCase())
        throw new BadRequestException('Repository webhook does not match its connection')
      body = { ...body, installation: { id: Number(connection.installationId) } }
    }
    const access = normalizeAccessEvent(event, body)
    if (access)
      return this.receiveAccess(
        deliveryId.toLowerCase(),
        createHash('sha256').update(event).update(raw).digest('hex'),
        access,
      )
    let displayAccepted = false
    // Only signed, connected-repository events may queue display refreshes. Never grant access from payloads.
    if (['push', 'create', 'delete', 'repository', 'repository_ruleset', 'workflow_run'].includes(event)) {
      const payload = body as {installation?: {id?: number}; repository?: {id?: number}}
      if (Number.isSafeInteger(payload?.installation?.id) && Number.isSafeInteger(payload?.repository?.id)) {
        await this.prisma.$transaction(async tx => {
          const installationId = BigInt(payload.installation!.id!), repositoryGithubId = BigInt(payload.repository!.id!)
          const connected = await tx.gitHubRepository.findFirst({where: {githubId: repositoryGithubId, installationId, selected: true, available: true, installation: {active: true}}})
          if (!connected) return
          displayAccepted = true
          const id = `github-display:${deliveryId.toLowerCase()}`
          const payloadHash = createHash('sha256').update(event).update(raw).digest('hex')
          const receipt = await tx.auditEvent.createMany({data: [{id, event: 'github.display_refresh_requested', metadata: {payloadHash, installationId: installationId.toString(), repositoryGithubId: repositoryGithubId.toString()}}], skipDuplicates: true})
          if (!receipt.count) {
            const prior = await tx.auditEvent.findUniqueOrThrow({where: {id}})
            if ((prior.metadata as {payloadHash?: string}).payloadHash !== payloadHash) throw new ConflictException('GitHub delivery identifier was reused')
            return
          }
          await tx.gitHubDisplayRead.updateMany({where: {installationId, repositoryGithubId, state: {not: 'INVALID'}}, data: {state: 'PENDING', generation: {increment: 1}}})
          await tx.gitHubDisplayRead.updateMany({where: {installationId, repositoryGithubId, OR: [{errorCode: null}, {errorCode: {not: 'GITHUB_RATE_LIMITED'}}]}, data: {nextAttemptAt: new Date()}})
        })
      }
    }
    const normalized = normalizeGitHubEvent(event, body)
    const contributorEvent = normalizeContributorEvent(event, body)
    if (contributorEvent) {
      const captured = await captureContributors(
        this.prisma,
        deliveryId.toLowerCase(),
        createHash('sha256').update(event).update(raw).digest('hex'),
        contributorEvent.installationId,
        contributorEvent.repositoryGithubId,
        contributorEvent.activities,
      )
      if (!normalized || !captured.accepted) return captured
    }
    if (!normalized) return displayAccepted ? { accepted: true, reason: 'display_refresh_queued' } : { accepted: false, reason: 'unsupported_event' }
    if (isPreflytFeedback(normalized.sourceIdentity))
      return { accepted: false, reason: 'preflyt_feedback_check' }
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

  async evidence(repositoryId: string, sha?: string, pageInput?: string, requestedSize?: unknown) {
    if (pageInput !== undefined && (typeof pageInput !== 'string' || !/^[1-9][0-9]{0,5}$/.test(pageInput)))
      throw new BadRequestException('A positive page number is required')
    const page = pageInput === undefined ? undefined : Number(pageInput)
    const pageSize = page === undefined ? 50 : readPageSize(requestedSize)
    if (
      sha !== undefined &&
      (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha))
    )
      throw new BadRequestException('A full commit SHA is required')
    const repository = await this.selectedRepository(repositoryId)
    const where = {
      repositoryGithubId: repository.githubId,
      installationId: repository.installationId,
      ...(sha === undefined ? {} : { sourceSha: sha.toLowerCase() }),
    }
    const observations = await this.prisma.importedCiEvidence.findMany({
      where,
      include: {
        artifacts: {
          select: artifactSummarySelect,
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ observedAt: 'desc' }, { deliveryId: 'desc' }],
      take: pageSize,
      ...(page === undefined ? {} : { skip: (page - 1) * pageSize }),
    })
    const total = page === undefined ? undefined : await this.prisma.importedCiEvidence.count({ where })
    return {
      ...(page === undefined ? {} : { pagination: { page, pageSize, total: total!, hasNext: page * pageSize < total! } }),
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

  async list(repositoryId: string, pageInput?: string, requestedSize?: unknown) {
    if (pageInput !== undefined && (typeof pageInput !== 'string' || !/^[1-9][0-9]{0,5}$/.test(pageInput)))
      throw new BadRequestException('A positive page number is required')
    const page = pageInput === undefined ? undefined : Number(pageInput)
    const pageSize = page === undefined ? 50 : readPageSize(requestedSize)
    const repository = await this.selectedRepository(repositoryId)
    const where = { repositoryGithubId: repository.githubId, installationId: repository.installationId }
    const deliveries = await this.prisma.gitHubWebhookDelivery.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(page === undefined ? {} : { skip: (page - 1) * pageSize }),
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
    const total = page === undefined ? undefined : await this.prisma.gitHubWebhookDelivery.count({ where })
    return { enabled: this.enabled, deliveries, ...(page === undefined ? {} : { pagination: { page, pageSize, total: total!, hasNext: page * pageSize < total! } }) }
  }
}
