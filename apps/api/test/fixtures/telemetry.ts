// Load the SDK before importing HTTP and database clients, as the real entries do.
const telemetry = await import('../../src/telemetry.js')
const { createServer } = await import('node:http')
const { once } = await import('node:events')
const { trace } = await import('@opentelemetry/api')
const server = createServer((req, res) => {
  telemetry.recordRequest(req.method ?? 'GET', 200, 1)
  res.end('core-ok')
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const port = (server.address() as { port: number }).port
const response = await fetch(`http://127.0.0.1:${port}/private?token=QUERY_SECRET`, { headers: { authorization: 'Bearer AUTH_SECRET', cookie: 'sid=COOKIE_SECRET' } })
if (await response.text() !== 'core-ok') throw new Error('Core request failed')
await telemetry.telemetryOperation('preflyt.github.event.process', { 'delivery.id': 'fixture-delivery', 'db.statement': 'SQL_SECRET' }, async () => {
  trace.getActiveSpan()?.addEvent('BODY_SECRET', { 'secret': 'EVENT_SECRET' })
}, '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01')
telemetry.telemetryLog('preflyt.worker.started', { 'password': 'PASSWORD_SECRET' })
await new Promise<void>(resolve => server.close(() => resolve()))
await telemetry.shutdownTelemetry()
console.log('core-ok')
