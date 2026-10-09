import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
const root = resolve(process.cwd(), '../..')
const config = parse(readFileSync(resolve(root, 'docker-compose.yaml'), 'utf8'), { merge: true })
it('starts all released services with separate persistent queue and disposable cache', () => {
  for (const name of ['web', 'api', 'worker', 'db', 'migrate', 'cache', 'queue']) expect(config.services[name].profiles).toBeUndefined()
  expect(config.services.queue.command).toContain('noeviction')
  expect(config.services.queue.command).toContain('yes')
  expect(config.services.queue.volumes).toEqual(['queue_data:/data'])
  expect(config.services.cache.command).toContain('allkeys-lru')
  expect(config.services.cache.volumes).toBeUndefined()
  expect(config.services.worker.depends_on.queue.condition).toBe('service_healthy')
  for (const name of ['db', 'cache', 'queue', 'api', 'worker']) expect(config.services[name].ports).toBeUndefined()
})
it('wires distinct service identities, optional collector and server-only exporter credentials', () => {
  expect(config.services.api.environment.OTEL_SERVICE_NAME).toBe('preflyt-api')
  expect(config.services.worker.environment.OTEL_SERVICE_NAME).toBe('preflyt-worker')
  expect(config.services.api.environment.OTEL_SDK_DISABLED).toBe('${OTEL_SDK_DISABLED:-true}')
  expect(config.services['otel-collector'].profiles).toEqual(['observability'])
  expect(JSON.stringify(config.services.web)).not.toContain('OTEL_EXPORTER_OTLP_HEADERS')
  const collector = parse(readFileSync(resolve(root, 'deploy/otel-collector.yaml'), 'utf8'))
  expect(Object.keys(collector.service.pipelines).sort()).toEqual(['logs', 'metrics', 'traces'])
})
it('provides root deployment configuration and a scoped versioned publishing workflow', () => {
  const env = readFileSync(resolve(root, '.env.example'), 'utf8')
  for (const name of ['POSTGRES_PASSWORD', 'DATABASE_APP_PASSWORD', 'WEB_ORIGIN', 'REDIS_URL', 'QUEUE_REDIS_URL', 'PREFLYT_IMAGE_REGISTRY', 'OTEL_EXPORTER_OTLP_ENDPOINT']) expect(env).toContain(name + '=')
  const workflow = parse(readFileSync(resolve(root, '.github/workflows/publish-images.yml'), 'utf8'))
  expect(workflow.jobs.publish.strategy.matrix.include.map((item: { image: string }) => item.image).sort()).toEqual(['preflyt-api', 'preflyt-api-migration', 'preflyt-native-controller', 'preflyt-web'])
  expect(workflow.jobs.publish.permissions.packages).toBe('write')
  expect(workflow.on.push.branches).toBeUndefined()
})
