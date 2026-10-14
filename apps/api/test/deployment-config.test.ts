import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
const root = resolve(process.cwd(), '../..')
const config = parse(readFileSync(resolve(root, 'docker-compose.yaml'), 'utf8'), { merge: true })
it('starts all released services with separate persistent queue and disposable cache', () => {
  for (const name of ['web', 'api', 'worker', 'db', 'migrate', 'cache', 'queue', 'health-engine', 'health-init', 'health-scanner']) expect(config.services[name].profiles).toBeUndefined()
  expect(config.services.queue.command).toContain('noeviction')
  expect(config.services.queue.command).toContain('yes')
  expect(config.services.queue.volumes).toEqual(['queue_data:/data'])
  expect(config.services.cache.command).toContain('allkeys-lru')
  expect(config.services.cache.volumes).toBeUndefined()
  expect(config.services.worker.depends_on.queue.condition).toBe('service_healthy')
  for (const name of ['db', 'cache', 'queue', 'api', 'worker']) expect(config.services[name].ports).toBeUndefined()
})

it('starts Health automatically with a separate TLS engine and HTTP-only application access', () => {
  const engine = config.services['health-engine'], scanner = config.services['health-scanner'], init = config.services['health-init']
  expect(engine.privileged).toBe(true)
  expect(engine.ports).toBeUndefined()
  expect(engine.environment.DOCKER_TLS_CERTDIR).toBe('/certs')
  expect(engine.volumes).toContain('health_jobs:/var/lib/preflyt/health-jobs:ro')
  expect(scanner.privileged).toBeUndefined()
  expect(scanner.user).toBe('1000:1000')
  expect(scanner.cap_drop).toEqual(['ALL'])
  expect(scanner.environment.DOCKER_TLS_VERIFY).toBe('1')
  expect(scanner.networks).toContain('health_build')
  expect(scanner.depends_on['health-init'].condition).toBe('service_completed_successfully')
  expect(scanner.healthcheck.test).toContain('dist/health/health-scanner-readiness.js')
  expect(init.network_mode).toBe('none')
  for (const name of ['api', 'worker']) {
    const service = config.services[name]
    expect(service.depends_on['health-scanner'].condition).toBe('service_healthy')
    expect(service.volumes).toEqual(['health_connection:/run/preflyt-health:ro'])
    expect(service.networks).toContain('health_service')
    expect(service.networks).not.toContain('health_engine')
    expect(service.environment.HEALTH_SCANNER_CONNECTION_FILE).toBe('/run/preflyt-health/connection.json')
    expect(JSON.stringify(service)).not.toMatch(/docker.sock|docker-tls|health_state|health_jobs|DOCKER_HOST|SIGNING_KEY/)
  }
  for (const service of [engine, scanner, init]) expect(JSON.stringify(service)).not.toMatch(/docker.sock|DATABASE_URL|GITHUB_APP_PRIVATE_KEY|CONFIGURATION_ENCRYPTION_KEY/)
  expect(scanner.volumes).not.toContain('health_engine_certs:/certs')
  expect(config.networks.health_engine.internal).toBe(true)
  expect(config.networks.health_service.internal).toBe(true)
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

  expect(workflow.jobs.publish.permissions.packages).toBe('write')
  expect(workflow.on.push.branches).toEqual(['development', 'main'])
})

it('ships Health scanner packaging without mounting engine authority or signing keys into the application',()=>{
 const dockerfile=readFileSync(resolve(root,'deploy/api.Dockerfile'),'utf8')
 expect(dockerfile).toMatch(/apt-get install[^\n]+\bgit\b/)
 expect(dockerfile).toContain('AS health-scanner')
 expect(dockerfile).toContain('COPY docs/deployment/native-runner /opt/preflyt/scanner-tools')
 expect(dockerfile).toContain('docker-buildx')
 const application=parse(readFileSync(resolve(root,'docs/deployment/health-scanner/application.compose.yaml'),'utf8'))
 for(const name of ['api','worker']){
  expect(application.services[name].volumes).toHaveLength(1)
  expect(application.services[name].volumes[0].read_only).toBe(true)
  expect(application.services[name].environment.HEALTH_SCANNER_CONNECTION_FILE).toBe('/run/preflyt-health/connection.json')
  expect(JSON.stringify(application.services[name])).not.toMatch(/docker.sock|docker-tls|identity.json|SIGNING_KEY/)
 }
 const scanner=parse(readFileSync(resolve(root,'docs/deployment/health-scanner/controller.compose.yaml'),'utf8')).services['health-scanner']
 expect(scanner.user).toBe('1000:1000');expect(scanner.read_only).toBe(true)
 expect(scanner.cap_drop).toEqual(['ALL'])
 expect(scanner.env_file).toBe('scanner.env')
 expect(JSON.stringify(scanner)).not.toMatch(/DATABASE_URL|GITHUB_APP_PRIVATE_KEY|docker.sock/)
})
