import { createServer, type ServerResponse } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { parseNativeApproval, type NativeApproval } from './native-approval.js'
import type { DockerApproval } from './native-docker-approval.js'
import { checkNativeControls } from './native-controls.js'
import { observeNativeRuntime } from './native-observer.js'
import { signNativeProbe, validNativeProbe } from './native-proof.js'
const hash = (v: string) => createHash('sha256').update(v).digest()
const reply = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(value))
}
type ReviewedRuntime = {
  approval: NativeApproval | DockerApproval
  approvalHash: string
}
export type NativePreflightAdapter = {
  review: () => ReviewedRuntime | null
  observe: (
    reviewed: ReviewedRuntime,
  ) => Promise<{ verified: boolean; failed: string[]; controlsHash: string }>
}
export function createNativeController(
  observer = observeNativeRuntime,
  adapter?: NativePreflightAdapter,
) {
  const secret = process.env.NATIVE_CONTROLLER_API_KEY ?? ''
  if (secret.length < 32 || secret.length > 256)
    throw new Error(
      'Configure a dedicated native controller API key of 32–256 characters',
    )
  let busy = false
  const server = createServer(async (req, res) => {
    if (req.url === '/health/live' && req.method === 'GET') {
      reply(res, 200, { status: 'ok' })
      return
    }
    if (req.url !== '/preflight' || req.method !== 'POST') {
      reply(res, 404, { message: 'Unavailable' })
      return
    }
    if (
      !timingSafeEqual(
        hash(req.headers.authorization ?? ''),
        hash('Bearer ' + secret),
      )
    ) {
      reply(res, 401, { message: 'Controller authentication required' })
      return
    }
    if (busy) {
      reply(res, 429, { message: 'Runtime observation is already in progress' })
      return
    }
    busy = true
    try {
      let body = ''
      for await (const chunk of req) {
        body += chunk.toString()
        if (Buffer.byteLength(body) > 2048) throw new Error('Request too large')
      }
      const input = JSON.parse(body)
      if (!validNativeProbe(input)) {
        reply(res, 400, { message: 'Invalid runtime observation request' })
        return
      }
      const reviewed = adapter ? adapter.review() : parseNativeApproval()
      if (
        !reviewed ||
        reviewed.approvalHash !== input.approvalHash ||
        !reviewed.approval.organizationIds.includes(input.organizationId)
      ) {
        reply(res, 503, {
          message:
            'Independent runtime review is missing, expired or outside this organization',
        })
        return
      }
      let result = {
        verified: false,
        failed: ['Runtime observation unavailable'],
        controlsHash: reviewed.approval.controlsHash,
      }
      try {
        result = adapter
          ? await adapter.observe(reviewed)
          : checkNativeControls(
              reviewed.approval as NativeApproval,
              await observer(reviewed.approval as NativeApproval),
            )
        if (
          (adapter ? adapter.review() : parseNativeApproval())?.approvalHash !==
          reviewed.approvalHash
        )
          throw new Error('Runtime review changed')
      } catch {
        result = {
          verified: false,
          failed: ['Runtime observation unavailable'],
          controlsHash: reviewed.approval.controlsHash,
        }
        /* Never expose runtime credentials or errors. */
      }
      // No jobs or repository code execute in this read-only preflight controller.
      const signature = signNativeProbe(
        {
          ...input,
          version: 1,
          environmentId: reviewed.approval.environmentId,
          checkedAt: new Date().toISOString(),
          ...result,
        },
        process.env.NATIVE_CONTROLLER_SIGNING_KEY ?? '',
        reviewed.approval,
      )
      reply(res, 200, { signature })
    } catch {
      reply(res, 400, { message: 'Runtime observation could not be completed' })
    } finally {
      busy = false
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.maxHeadersCount = 32
  server.timeout = 15000
  return server
}
