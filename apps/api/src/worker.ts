import 'dotenv/config'
process.env.OTEL_SERVICE_NAME ??= 'preflyt-worker'
await import('./telemetry.js')
await (await import('./configuration/configuration-bootstrap.js')).loadDeploymentConfiguration(false)
await import('./worker.bootstrap.js')
