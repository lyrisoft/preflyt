import { nativeSelectionCurrent } from './native-selection-current.js'
import { recordNativeExecutionFailure } from '../notifications/notification-event.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import { digest } from '../assessments/assessment-digest.js'
import { verifyNativeReceipt } from './native-receipt.js'
import { randomUUID } from 'node:crypto'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { AuthorizationService } from '../auth/authorization.service.js'
import type { GitHubProviderService } from '../github/github-provider.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { NativeResultService } from './native-result.service.js'
import { nativeRequestIntegrity } from './native-request-integrity.js'
import { nativeRuntimeApproval } from './native-runtime.js'
import { nativeAdmission } from './native-admission.js'
import { nativeEvidenceExpected } from './native-evidence.js'
import { nativeControllerCall } from './native-controller-client.js'
import type { NativeStatusService } from './native-status.service.js'
/** Durable PostgreSQL inbox with bounded claims. No runtime-control authority in the worker. */
export class NativeDispatchService {
  private shutdown = new AbortController()
  constructor(
    private prisma: PrismaService,
    private access: AuthorizationService,
    private github: GitHubProviderService,
    private status: NativeStatusService,
    private results: NativeResultService,
  ) {}
  close() {
    this.shutdown.abort()
  }
  async reconcile() {
    if (this.shutdown.signal.aborted) return
    const enabled = configurationValue('NATIVE_EXECUTION_ENABLED') === 'true'
    const now = new Date()
    const rows = await this.prisma.nativeExecutionRequest.findMany({
      where: {
        state: { in: enabled ? ['QUEUED', 'PREPARING', 'RUNNING', 'CANCEL_REQUESTED'] : ['PREPARING', 'RUNNING', 'CANCEL_REQUESTED'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: 4,
    })
    for (const row of rows) {
      if (this.shutdown.signal.aborted) return
      if (!enabled && row.state === 'QUEUED') continue
      const lease = new Date(Date.now() + 120000)
      const claimed = await this.prisma.nativeExecutionRequest.updateMany({
        where: { id: row.id, state: row.state, leaseUntil: row.leaseUntil },
        data: {
          leaseUntil: lease,
          attempts: { increment: 1 },
          ...(row.state === 'QUEUED'
            ? { state: 'PREPARING', controllerJobId: randomUUID() }
            : {}),
        },
      })
      if (!claimed.count) continue
      await this.process(row.id, lease)
    }
  }
  private async process(id: string, lease: Date) {
    let row = await this.prisma.nativeExecutionRequest.findUniqueOrThrow({
      where: { id },
    })
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: row.actorId,
      organizationId: row.organizationId,
      subject: 'native-dispatch',
      email: null,
      role: 'WORKER',
    }
    try {
      if (Date.now() - row.requestedAt.getTime() > 1800000)
        throw new Error('Native attempt deadline exceeded')
      if (!nativeRequestIntegrity(row))
        throw new Error('Native request changed')
      const repo = await this.access.requireRepository(
        session,
        row.repositoryGithubId,
        'execution.run',
      )
      if (!await nativeSelectionCurrent(this.prisma, row))
        throw new Error('Native standards changed')
      const preflight = await this.status.status(
        session,
        row.repositoryGithubId,
      )
      const reviewed = nativeRuntimeApproval()
      if (!preflight.executionAvailable || !reviewed)
        throw new Error('Native admission unavailable')
      if (row.state === 'PREPARING') {
        const installation =
          await this.prisma.gitHubRepository.findUniqueOrThrow({
            where: { id: repo.id },
            select: { installationId: true },
          })
        const source = await this.github.readNativeSource(
          installation.installationId,
          BigInt(row.repositoryGithubId),
          row.sourceSha,
          this.shutdown.signal,
        )
        await this.access.requireRepository(
          session,
          row.repositoryGithubId,
          'execution.run',
        )
        const selectionCurrent = await nativeSelectionCurrent(this.prisma, row)
        if (
          !selectionCurrent ||
          (row.sourceHash && row.sourceHash !== source.sourceHash) ||
          (row.runtimeApprovalHash &&
            row.runtimeApprovalHash !== reviewed.approvalHash)
        )
          throw new Error('Native admission changed during source export')
        const updated = await this.prisma.nativeExecutionRequest.updateMany({
          where: { id, state: 'PREPARING', leaseUntil: lease },
          data: {
            sourceHash: source.sourceHash,
            runtimeApprovalHash: reviewed.approvalHash,
            environmentId: reviewed.approval.environmentId,
          },
        })
        if (!updated.count) return
        row = await this.prisma.nativeExecutionRequest.findUniqueOrThrow({
          where: { id },
        })
        const expected = nativeEvidenceExpected(row)
        if (!expected) throw new Error('Native admission inputs unavailable')
        nativeAdmission(expected)
        await nativeControllerCall(
          'admit',
          expected,
          source,
          this.shutdown.signal,
        )
        await this.prisma.nativeExecutionRequest.updateMany({
          where: { id, state: 'PREPARING', leaseUntil: lease },
          data: { state: 'RUNNING' },
        })
      }
      row = await this.prisma.nativeExecutionRequest.findUniqueOrThrow({
        where: { id },
      })
      const expected = nativeEvidenceExpected(row)
      if (!expected) throw new Error('Native admission inputs unavailable')
      // Cancellation always refers to the admitted attempt, never a new job.
      const result = await nativeControllerCall(
        row.state === 'CANCEL_REQUESTED' ? 'cancel' : 'status',
        expected,
        undefined,
        this.shutdown.signal,
      )
      if (result.state === 'COMPLETE' && result.signature) {
        await this.results.complete(id, result.signature)
      } else if (result.state === 'COMPLETE') {
        await this.prisma.$transaction(async (tx) => {
          const live = await tx.nativeExecutionRequest.findUniqueOrThrow({
            where: { id },
          })
          const failed =
            live.state === 'RUNNING' &&
            !live.cancelledById &&
            nativeRequestIntegrity(live)
          const changed = await tx.nativeExecutionRequest.updateMany({
            where: {
              id,
              leaseUntil: lease,
              state: live.state,
              cancelledById: live.cancelledById,
            },
            data: {
              state: failed ? 'FAILED' : 'BLOCKED',
              reason: 'CURRENT_NATIVE_EXECUTION_NOT_VERIFIED',
              finishedAt: new Date(),
              leaseUntil: null,
            },
          })
          if (changed.count && failed)
            await recordNativeExecutionFailure(tx, live)
        })
      } else {
        await this.prisma.nativeExecutionRequest.updateMany({
          where: { id, leaseUntil: lease },
          data: { leaseUntil: new Date(Date.now() + 5000) },
        })
      }
    } catch {
      if (this.shutdown.signal.aborted) return // Another worker resumes the same admitted attempt after the lease expires.
      const expected = nativeEvidenceExpected(row)
      if (expected) {
        const result = await nativeControllerCall('cancel', expected).catch(
          () => null,
        )
        const receipt = result?.signature
          ? verifyNativeReceipt(result.signature, expected)
          : null
        if (
          receipt?.cancelled &&
          receipt.checks.every((c) => c.cleanupConfirmed)
        ) {
          // Cleanup acknowledgement needs no revoked execution permission. A worker
          // interruption is a failure; explicit user cancellation remains silent.
          await this.prisma.$transaction(async (tx) => {
            const live = await tx.nativeExecutionRequest.findUniqueOrThrow({
              where: { id },
            })
            const admitted =
              live.state === 'RUNNING' ||
              (live.state === 'CANCEL_REQUESTED' &&
                live.reason === 'EXECUTION_INTERRUPTED')
            const failed =
              admitted && !live.cancelledById && nativeRequestIntegrity(live)
            const timedOut = Date.now() - live.requestedAt.getTime() > 1800000
            const state = failed
              ? timedOut
                ? 'TIMED_OUT'
                : 'FAILED'
              : 'CANCELLED'
            const changed = await tx.nativeExecutionRequest.updateMany({
              where: {
                id,
                leaseUntil: lease,
                state: live.state,
                cancelledById: live.cancelledById,
              },
              data: {
                state,
                reason: failed
                  ? timedOut
                    ? 'EXECUTION_TIMED_OUT'
                    : 'EXECUTION_UNAVAILABLE'
                  : 'EXECUTION_CANCELLED',
                leaseUntil: null,
                finishedAt: new Date(),
                receiptHash: digest(result!.signature!),
                receiptSignature: result!.signature!,
              },
            })
            if (changed.count) {
              await tx.auditEvent.create({
                data: {
                  event: failed
                    ? 'native.execution.failed'
                    : 'native.execution.cancelled',
                  actorId: live.actorId,
                  metadata: {
                    requestId: id,
                    organizationId: live.organizationId,
                    repositoryGithubId: live.repositoryGithubId,
                    attemptId: live.controllerJobId,
                  },
                },
              })
              if (failed) await recordNativeExecutionFailure(tx, live)
            }
          })
          return
        }
      }
      // Fail closed while retaining attempt identity for controller cleanup reconciliation.
      await this.prisma.$transaction(async (tx) => {
        const live = await tx.nativeExecutionRequest.findUniqueOrThrow({
          where: { id },
        })
        const timedOut = Date.now() - live.requestedAt.getTime() > 1800000
        const admitted =
          live.state === 'RUNNING' ||
          (live.state === 'CANCEL_REQUESTED' &&
            live.reason === 'EXECUTION_INTERRUPTED')
        const failed =
          admitted && !live.cancelledById && nativeRequestIntegrity(live)
        const changed = await tx.nativeExecutionRequest.updateMany({
          where: {
            id,
            leaseUntil: lease,
            state: live.state,
            cancelledById: live.cancelledById,
          },
          data: {
            state: timedOut
              ? 'TIMED_OUT'
              : expected
                ? 'CANCEL_REQUESTED'
                : 'BLOCKED',
            reason:
              timedOut && expected
                ? 'CLEANUP_UNCONFIRMED'
                : failed
                  ? 'EXECUTION_INTERRUPTED'
                  : 'EXECUTION_UNAVAILABLE',
            leaseUntil:
              expected && !timedOut ? new Date(Date.now() + 15000) : null,
            finishedAt: expected && !timedOut ? null : new Date(),
          },
        })
        if (changed.count && timedOut && failed)
          await recordNativeExecutionFailure(tx, live)
      })
    }
  }
}
