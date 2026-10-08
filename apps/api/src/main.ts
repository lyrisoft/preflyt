import 'dotenv/config'
process.env.OTEL_SERVICE_NAME ??= 'preflyt-api'
await import('./telemetry.js')
await import('./api.bootstrap.js')
