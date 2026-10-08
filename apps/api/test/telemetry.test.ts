import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Server, ServerCredentials, type ServiceDefinition, type ServerUnaryCall, type sendUnaryData } from '@grpc/grpc-js'
import { expect, it } from 'vitest'

const traceId = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')
async function fixture(endpoint: string, protocol: string, extra: Record<string, string> = {}) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('tsx/cli')), 'test/fixtures/telemetry.ts'], {
    env: { ...process.env, OTEL_SDK_DISABLED: 'false', OTEL_EXPORTER_OTLP_ENDPOINT: endpoint, OTEL_EXPORTER_OTLP_PROTOCOL: protocol,
      OTEL_EXPORTER_OTLP_HEADERS: 'x-test-auth=EXPORTER_SECRET', OTEL_SERVICE_NAME: 'preflyt-worker', OTEL_RESOURCE_ATTRIBUTES: 'service.namespace=preflyt-test',
      OTEL_TRACES_SAMPLER: 'always_on', OTEL_EXPORTER_OTLP_TIMEOUT: '300', OTEL_METRIC_EXPORT_INTERVAL: '1000', ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''; let errors = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { errors += data })
  const timer = setTimeout(() => child.kill('SIGKILL'), 8000)
  const [code] = await once(child, 'exit')
  clearTimeout(timer)
  expect(code, errors).toBe(0)
  expect(output).toContain('core-ok')
  expect(output + errors).not.toContain('EXPORTER_SECRET')
}
function safePayload(payloads: Buffer[]) {
  const combined = Buffer.concat(payloads)
  expect(combined.toString()).toContain('preflyt-worker')
  expect(combined.toString()).toContain('preflyt.github.event.process')
  expect(combined.toString()).toContain('integration.request')
  expect(combined.includes(traceId)).toBe(true)
  for (const secret of ['QUERY_SECRET', 'AUTH_SECRET', 'COOKIE_SECRET', 'SQL_SECRET', 'BODY_SECRET', 'EVENT_SECRET', 'PASSWORD_SECRET', 'EXPORTER_SECRET'])
    expect(combined.toString()).not.toContain(secret)
}
it('exports redacted traces, metrics and logs over OTLP HTTP with parent context and configured headers', async () => {
  const payloads: Buffer[] = []; const paths = new Set<string>(); const headers: string[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk))
    payloads.push(Buffer.concat(chunks)); paths.add(req.url!); headers.push(String(req.headers['x-test-auth']))
    res.setHeader('content-type', 'application/x-protobuf'); res.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    await fixture(`http://127.0.0.1:${(server.address() as { port: number }).port}`, 'http/protobuf')
    expect([...paths].sort()).toEqual(['/v1/logs', '/v1/metrics', '/v1/traces'])
    expect(headers.every(header => header === 'EXPORTER_SECRET')).toBe(true)
    safePayload(payloads)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
it('exports all three signals over OTLP gRPC', async () => {
  const server = new Server(); const signals = new Set<string>(); const payloads: Buffer[] = []
  for (const [signal, service] of [['trace', 'TraceService'], ['metrics', 'MetricsService'], ['logs', 'LogsService']]) {
    const definition: ServiceDefinition = { Export: { path: `/opentelemetry.proto.collector.${signal}.v1.${service}/Export`, requestStream: false, responseStream: false,
      requestSerialize: value => value, requestDeserialize: value => value, responseSerialize: value => value, responseDeserialize: value => value } }
    server.addService(definition, { Export: (call: ServerUnaryCall<Buffer, Buffer>, callback: sendUnaryData<Buffer>) => {
      signals.add(signal!); payloads.push(call.request); expect(call.metadata.get('x-test-auth')).toEqual(['EXPORTER_SECRET']); callback(null, Buffer.alloc(0))
    } })
  }
  const port = await new Promise<number>((resolve, reject) => server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)))
  try { await fixture(`http://127.0.0.1:${port}`, 'grpc'); expect([...signals].sort()).toEqual(['logs', 'metrics', 'trace']); safePayload(payloads) }
  finally { await new Promise<void>((resolve, reject) => server.tryShutdown(error => error ? reject(error) : resolve())) }
})
it('runs normally with the SDK disabled', async () => { await fixture('http://127.0.0.1:1', 'http/protobuf', { OTEL_SDK_DISABLED: 'true' }) })
it('keeps core requests working with an unreachable exporter', async () => { await fixture('http://127.0.0.1:1', 'http/protobuf') })
it('keeps core requests working with invalid telemetry configuration', async () => { await fixture('not-a-url', 'unsupported') })
