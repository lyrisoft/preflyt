import 'dotenv/config'
process.env.OTEL_SERVICE_NAME ??= 'preflyt-api'
await import('./telemetry.js')
await (await import('./configuration/configuration-bootstrap.js')).loadDeploymentConfiguration()
await import('./api.bootstrap.js')
