import 'dotenv/config'
process.env.OTEL_SERVICE_NAME ??= 'preflyt-worker'
await import('./telemetry.js')
await import('./worker.bootstrap.js')
