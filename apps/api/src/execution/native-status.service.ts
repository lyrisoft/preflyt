import { Inject, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { nativeRuntimeApproval } from './native-runtime.js'
import { verifyNativeProbe } from './native-proof.js'
@Injectable()
export class NativeStatusService {
  constructor(
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  async status(session: AuthenticatedSession, repositoryId: string) {
    await this.access.requireRepository(
      session,
      repositoryId,
      'assessment.read',
    )
    const checkedAt = new Date().toISOString()
    const base = {
      mode: 'INGEST_ONLY',
      executionAvailable: false,
      checkedAt,
      preflightVerified: false,
    }
    if (process.env.NATIVE_PREFLIGHT_ENABLED !== 'true')
      return {
        ...base,
        reason: 'PREFLIGHT_DISABLED',
        message:
          'Preflyt uses imported CI results. Sandbox verification is not enabled.',
      }
    const reviewed = nativeRuntimeApproval()
    if (
      !reviewed ||
      !reviewed.approval.organizationIds.includes(session.organizationId!)
    )
      return {
        ...base,
        reason: 'REVIEW_REQUIRED',
        message:
          'An independent sandbox review is required before Preflyt can run checks.',
      }
    const input = {
      nonce: randomUUID(),
      organizationId: session.organizationId!,
      repositoryId,
      approvalHash: reviewed.approvalHash,
    }
    try {
      const key = process.env.NATIVE_CONTROLLER_API_KEY ?? ''
      if (key.length < 32 || key.length > 256)
        throw new Error('Controller connection not configured')
      const response = await fetch(
        reviewed.approval.controllerOrigin + '/preflight',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!response.ok) throw new Error('Controller unavailable')
      if (Number(response.headers.get('content-length') ?? 0) > 20000)
        throw new Error('Response too large')
      let bytes = 0,
        text = ''
      if (!response.body) throw new Error('Missing response')
      for await (const chunk of response.body as any) {
        bytes += chunk.length
        if (bytes > 20000) throw new Error('Response too large')
        text += Buffer.from(chunk).toString()
      }
      const data = JSON.parse(text),
        proof =
          typeof data.signature === 'string'
            ? verifyNativeProbe(data.signature, input, reviewed.approval)
            : null
      if (!proof) throw new Error('Unverified controller response')
      // Recheck current scoped access and independent approval after the network operation.
      await this.access.requireRepository(
        session,
        repositoryId,
        'assessment.read',
      )
      if (nativeRuntimeApproval()?.approvalHash !== reviewed.approvalHash)
        throw new Error('Review changed')
      const available =
        process.env.NATIVE_EXECUTION_ENABLED === 'true' &&
        proof.verified &&
        proof.executionAvailable === true
      return {
        ...base,
        executionAvailable: available,
        mode: available ? 'HYBRID' : 'INGEST_ONLY',
        checkedAt: proof.checkedAt,
        preflightVerified: proof.verified,
        reason: available
          ? 'READY'
          : proof.verified
            ? 'DISPATCHER_REQUIRED'
            : 'RUNTIME_CONTROLS_CHANGED',
        message: available
          ? 'Preflyt can run reviewed checks for this repository.'
          : proof.verified
            ? 'Sandbox review and current controls are verified. Running checks is not enabled yet.'
            : 'Sandbox controls changed or could not be verified. Imported CI remains available.',
        failed: proof.failed,
      }
    } catch {
      await this.access.requireRepository(
        session,
        repositoryId,
        'assessment.read',
      )
      return {
        ...base,
        reason: 'CONTROLLER_UNAVAILABLE',
        message:
          'The sandbox controller could not be verified. Imported CI remains available.',
      }
    }
  }
}
