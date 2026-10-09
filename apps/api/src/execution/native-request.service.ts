import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { digest } from '../assessments/assessment-digest.js'
import type {
  NativeExecutionRequest,
  Prisma,
} from '../generated/prisma/client.js'
import { NativePlanService } from './native-plan.service.js'
import { NativeStatusService } from './native-status.service.js'
import { nativeAdapters } from './native-plan.js'
export type NativeRequestInput = {
  requestKey: string
  expectedSourceSha: string
  expectedSelectionId: string
  expectedPlanHash: string
  ruleIds: string[]
}
const uuid = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  )
const summary = (r: NativeExecutionRequest) => ({
  id: r.id,
  sourceSha: r.sourceSha,
  selectionId: r.selectionId,
  planHash: r.planHash,
  ruleIds: r.ruleIds,
  state: r.state,
  reason: r.reason,
  requestedAt: r.requestedAt,
  finishedAt: r.finishedAt,
})
@Injectable()
export class NativeRequestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(NativePlanService) private readonly plans: NativePlanService,
    @Inject(NativeStatusService) private readonly status: NativeStatusService,
  ) {}
  private verify(record: NativeExecutionRequest) {
    const plan = record.plan as Record<string, unknown>
    if (
      !plan ||
      digest(plan) !== record.planHash ||
      plan.repositoryId !== record.repositoryGithubId ||
      plan.organizationId !== record.organizationId ||
      plan.sourceSha !== record.sourceSha ||
      plan.selectionId !== record.selectionId ||
      digest({
        organizationId: record.organizationId,
        repositoryId: record.repositoryGithubId,
        actorId: record.actorId,
        input: {
          requestKey: record.requestKey,
          expectedSourceSha: record.sourceSha,
          expectedSelectionId: record.selectionId,
          expectedPlanHash: record.planHash,
          ruleIds: record.ruleIds,
        },
      }) !== record.inputHash
    )
      throw new ConflictException(
        'Check request integrity could not be verified',
      )
    return summary(record)
  }
  private async change<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: 'Serializable',
        })
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          !['P2034', 'P2002'].includes(String(error.code))
        )
          throw error
        if (attempt === 2)
          throw new ConflictException(
            'Check request changed. Refresh and try again.',
          )
      }
    }
    throw new ConflictException('Check request changed. Refresh and try again.')
  }
  async request(
    session: AuthenticatedSession,
    repositoryId: string,
    body: NativeRequestInput,
  ) {
    const repo = await this.access.requireRepository(
      session,
      repositoryId,
      'execution.run',
    )
    if (
      !uuid(body.requestKey) ||
      !/^[a-f0-9]{40}$/.test(body.expectedSourceSha) ||
      !/^[a-f0-9]{64}$/.test(body.expectedPlanHash) ||
      typeof body.expectedSelectionId !== 'string' ||
      body.expectedSelectionId.length > 100 ||
      !body.expectedSelectionId ||
      !Array.isArray(body.ruleIds) ||
      !body.ruleIds.length ||
      body.ruleIds.length > 16 ||
      new Set(body.ruleIds).size !== body.ruleIds.length ||
      body.ruleIds.some(
        (id) => typeof id !== 'string' || !Object.hasOwn(nativeAdapters, id),
      )
    )
      throw new BadRequestException(
        'Choose supported checks and use the current recorded commit and standards.',
      )
    const input = { ...body, ruleIds: [...body.ruleIds].sort() }
    const inputHash = digest({
      organizationId: session.organizationId,
      repositoryId,
      actorId: session.identityId,
      input,
    })
    const prior = await this.prisma.nativeExecutionRequest.findUnique({
      where: {
        repositoryId_requestKey: {
          repositoryId: repo.id,
          requestKey: input.requestKey,
        },
      },
    })
    if (prior) {
      if (
        prior.organizationId !== session.organizationId ||
        prior.inputHash !== inputHash
      )
        throw new ConflictException(
          'This request key was already used for different checks',
        )
      return this.verify(prior)
    }
    const plan = await this.plans.get(session, repositoryId)
    if (
      plan.sourceSha !== input.expectedSourceSha ||
      plan.selectionId !== input.expectedSelectionId ||
      plan.planHash !== input.expectedPlanHash ||
      input.ruleIds.some((id) => !plan.steps.some((s) => s.ruleId === id))
    )
      throw new ConflictException(
        'The source, standards or reviewed tools changed. Refresh the check plan.',
      )
    const native = await this.status.status(session, repositoryId)
    const missingTool = plan.steps.find(
      (s) =>
        input.ruleIds.includes(s.ruleId) && s.reason === 'TOOL_REVIEW_REQUIRED',
    )
    const reason = !native.preflightVerified
      ? native.reason
      : missingTool
        ? 'TOOL_REVIEW_REQUIRED'
        : 'DISPATCHER_REQUIRED'
    const { planHash, recordedAt, branch, ...storedPlan } = plan
    const result = await this.change(async (tx) => {
      const live = await new AuthorizationService(
        tx as PrismaService,
      ).requireRepository(session, repositoryId, 'execution.run')
      const existing = await tx.nativeExecutionRequest.findUnique({
        where: {
          repositoryId_requestKey: {
            repositoryId: live.id,
            requestKey: input.requestKey,
          },
        },
      })
      if (existing) {
        if (
          existing.organizationId !== session.organizationId ||
          existing.inputHash !== inputHash
        )
          throw new ConflictException(
            'This request key was already used for different checks',
          )
        return existing
      }
      const selection = await tx.repositoryStandardsSelection.findFirst({
        where: { repositoryId: live.id },
        orderBy: { revision: 'desc' },
      })
      const profile = await tx.repositoryProfile.findFirst({
        where: { repositoryId: live.id },
        orderBy: { createdAt: 'desc' },
      })
      if (
        selection?.id !== input.expectedSelectionId ||
        profile?.sourceSha !== input.expectedSourceSha
      )
        throw new ConflictException(
          'Source or standards changed. Refresh the check plan.',
        )
      if (
        (await tx.nativeExecutionRequest.count({
          where: {
            repositoryId: live.id,
            actorId: session.identityId,
            requestedAt: { gte: new Date(Date.now() - 3600000) },
          },
        })) >= 60
      )
        throw new ConflictException(
          'Too many recent check requests. Wait before requesting again.',
        )
      const record = await tx.nativeExecutionRequest.create({
        data: {
          organizationId: session.organizationId!,
          repositoryId: live.id,
          repositoryGithubId: repositoryId,
          actorId: session.identityId,
          requestKey: input.requestKey,
          inputHash,
          sourceSha: input.expectedSourceSha,
          selectionId: input.expectedSelectionId,
          planHash,
          plan: storedPlan as unknown as Prisma.InputJsonValue,
          ruleIds: input.ruleIds,
          state: 'BLOCKED',
          reason,
          finishedAt: new Date(),
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'native.execution.blocked',
          actorId: session.identityId,
          metadata: {
            organizationId: session.organizationId,
            repositoryGithubId: repositoryId,
            requestId: record.id,
            sourceSha: record.sourceSha,
            planHash,
            reason,
          },
        },
      })
      return record
    })
    await this.access.requireRepository(session, repositoryId, 'execution.run')
    return this.verify(result)
  }
  async list(session: AuthenticatedSession, repositoryId: string, page = 1) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new BadRequestException('Choose a valid results page')
    const repo = await this.access.requireRepository(
      session,
      repositoryId,
      'assessment.read',
    )
    const where = {
      repositoryId: repo.id,
      organizationId: session.organizationId!,
    }
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.nativeExecutionRequest.findMany({
          where,
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
          take: 20,
          skip: (page - 1) * 20,
        }),
        this.prisma.nativeExecutionRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    await this.access.requireRepository(
      session,
      repositoryId,
      'assessment.read',
    )
    return {
      items: rows.map((r) => this.verify(r)),
      page,
      pageSize: 20,
      total,
      pages: Math.ceil(total / 20),
    }
  }
  async cancel(
    session: AuthenticatedSession,
    repositoryId: string,
    id: string,
  ) {
    if (!uuid(id)) throw new BadRequestException('Use a valid check request ID')
    await this.access.requireRepository(session, repositoryId, 'execution.run')
    const record = await this.change(async (tx) => {
      const repo = await new AuthorizationService(
        tx as PrismaService,
      ).requireRepository(session, repositoryId, 'execution.run')
      const request = await tx.nativeExecutionRequest.findFirst({
        where: {
          id,
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
      })
      if (!request) throw new NotFoundException('Check request is unavailable')
      this.verify(request)
      if (!['QUEUED', 'PREPARING', 'RUNNING'].includes(request.state))
        return request
      const state =
        request.state === 'QUEUED' && !request.controllerJobId
          ? 'CANCELLED'
          : 'CANCEL_REQUESTED'
      const updated = await tx.nativeExecutionRequest.update({
        where: { id },
        data: {
          state,
          cancelledById: session.identityId,
          finishedAt: state === 'CANCELLED' ? new Date() : null,
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'native.execution.cancel_requested',
          actorId: session.identityId,
          metadata: {
            organizationId: session.organizationId,
            repositoryGithubId: repositoryId,
            requestId: id,
            state,
          },
        },
      })
      return updated
    })
    await this.access.requireRepository(session, repositoryId, 'execution.run')
    return this.verify(record)
  }
}
