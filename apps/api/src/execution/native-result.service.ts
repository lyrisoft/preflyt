import { nativeRequestIntegrity } from './native-request-integrity.js'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { AssessmentService } from '../assessments/assessment.service.js'
import { digest } from '../assessments/assessment-digest.js'
import { nativeEvidenceExpected } from './native-evidence.js'
import { verifyNativeReceipt } from './native-receipt.js'

/** Internal worker result sink. There is deliberately no browser-supplied-result endpoint. */
export class NativeResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AuthorizationService,
    private readonly assessments: AssessmentService,
  ) {}
  async complete(requestId: string, signature: string) {
    const record = await this.prisma.nativeExecutionRequest.findUnique({
      where: { id: requestId },
    })
    if (!record) throw new NotFoundException('Native request is unavailable')
    if (!nativeRequestIntegrity(record))
      throw new ConflictException('Native request integrity changed')
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: record.actorId,
      organizationId: record.organizationId,
      subject: 'native-request',
      email: null,
      role: 'WORKER',
    }
    // Live membership and GitHub access, not the role captured when the request was created.
    await this.access.requireRepository(
      session,
      record.repositoryGithubId,
      'execution.run',
    )
    const expected = nativeEvidenceExpected(record)
    const receipt = expected ? verifyNativeReceipt(signature, expected) : null
    if (!receipt)
      throw new ConflictException(
        'Native execution receipt could not be verified',
      )
    const receiptHash = digest(signature)
    const result = await this.prisma.$transaction(
      async (tx) => {
        await new AuthorizationService(tx as PrismaService).requireRepository(
          session,
          record.repositoryGithubId,
          'execution.run',
        )
        const live = await tx.nativeExecutionRequest.findUniqueOrThrow({
          where: { id: requestId },
        })
        if (live.receiptHash) {
          if (
            live.receiptHash !== receiptHash ||
            live.receiptSignature !== signature
          )
            throw new ConflictException(
              'A different result already completed this attempt',
            )
          return { record: live, duplicate: true }
        }
        const liveExpected = nativeEvidenceExpected(live)
        if (
          !nativeRequestIntegrity(live) ||
          !liveExpected ||
          digest(liveExpected) !== digest(expected) ||
          !['RUNNING', 'CANCEL_REQUESTED'].includes(live.state) ||
          !live.leaseUntil ||
          live.leaseUntil.getTime() <= Date.now()
        )
          throw new ConflictException(
            'Native attempt changed or its worker lease expired',
          )
        const selection = await tx.repositoryStandardsSelection.findFirst({
          where: { repositoryId: live.repositoryId },
          orderBy: { revision: 'desc' },
        })
        if (selection?.id !== live.selectionId)
          throw new ConflictException(
            'Standards changed during native execution',
          )
        const cleanup = receipt.checks.every((c) => c.cleanupConfirmed)
        const cancelled = live.state === 'CANCEL_REQUESTED' || receipt.cancelled
        const state = !cleanup
          ? 'BLOCKED'
          : cancelled
            ? 'CANCELLED'
            : receipt.checks.some((c) => c.state === 'FAIL')
              ? 'FAILED'
              : receipt.checks.every(
                    (c) => c.state === 'PASS' && c.coverage === 'FULL_RULE',
                  )
                ? 'SUCCEEDED'
                : 'BLOCKED'
        const reason = !cleanup
          ? 'CLEANUP_UNCONFIRMED'
          : cancelled
            ? 'EXECUTION_CANCELLED'
            : state === 'BLOCKED'
              ? 'EVIDENCE_INCOMPLETE'
              : null
        const updated = await tx.nativeExecutionRequest.update({
          where: { id: live.id },
          data: {
            state,
            reason,
            receiptSignature: signature,
            receiptHash,
            finishedAt: new Date(receipt.finishedAt),
            leaseUntil: null,
          },
        })
        await tx.auditEvent.create({
          data: {
            event: 'native.execution.completed',
            actorId: live.actorId,
            metadata: {
              organizationId: live.organizationId,
              repositoryGithubId: live.repositoryGithubId,
              requestId: live.id,
              attemptId: live.controllerJobId,
              sourceSha: live.sourceSha,
              receiptHash,
              state,
              reason,
            },
          },
        })
        return { record: updated, duplicate: false }
      },
      { isolationLevel: 'Serializable' },
    )
    await this.access.requireRepository(
      session,
      record.repositoryGithubId,
      'execution.run',
    )
    // Separate immutable assessment; retrying a persisted completion repairs a missed assessment without rerunning code.
    if (['SUCCEEDED', 'FAILED', 'BLOCKED'].includes(result.record.state))
      await this.assessments.createNative(
        record.repositoryGithubId,
        record.sourceSha,
        record.selectionId,
        'native:' + record.id,
        record.actorId,
      )
    return {
      requestId,
      state: result.record.state,
      duplicate: result.duplicate,
    }
  }
}
