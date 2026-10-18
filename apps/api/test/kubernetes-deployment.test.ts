import { configurationFields } from '../src/configuration/configuration-catalogue.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, parseAllDocuments } from 'yaml'
import { describe, expect, it } from 'vitest'
const root = resolve(process.cwd(), '../..')
const docs = parseAllDocuments(
  readFileSync(resolve(root, 'deploy/kubernetes/resources.yaml'), 'utf8'),
).map((doc) => doc.toJSON())
const migration = parse(
  readFileSync(resolve(root, 'deploy/kubernetes/migration.yaml'), 'utf8'),
)
const compose = parse(
  readFileSync(resolve(root, 'docker-compose.yaml'), 'utf8'),
  { merge: true },
)
const get = (kind: string, name: string) =>
  docs.find((doc) => doc.kind === kind && doc.metadata.name === name)
const pod = (kind: string, name: string) => get(kind, name).spec.template.spec
const allPods = [
  ...docs.filter((doc) => ['Deployment', 'StatefulSet'].includes(doc.kind)),
  migration,
].map((doc) => doc.spec.template.spec)
describe('Kubernetes container deployment contract', () => {
  it('keeps applications stopped until the separate migration is accepted', () => {
    for (const name of ['api', 'worker', 'web'])
      expect(get('Deployment', name).spec.replicas).toBe(0)
    expect(docs.some((doc) => doc.kind === 'Job')).toBe(false)
    expect(migration.spec.backoffLimit).toBe(0)
    expect(migration.spec.activeDeadlineSeconds).toBe(600)
    expect(migration.spec.template.spec.containers[0].env).toEqual([
      {
        name: 'DATABASE_URL',
        valueFrom: {
          secretKeyRef: {
            name: 'preflyt-migration-secrets',
            key: 'DATABASE_URL',
          },
        },
      },
    ])
  })
  it('uses the same API image for HTTP and the worker with explicit worker command', () => {
    const api = pod('Deployment', 'api').containers[0]
    const worker = pod('Deployment', 'worker').containers[0]
    expect(worker.image).toBe(api.image)
    expect(worker.command).toEqual(compose.services.worker.command)
    expect(pod('Deployment', 'web').containers[0].envFrom).toBeUndefined()
    expect(api.envFrom[1].secretRef.name).toBe('preflyt-api-secrets')
    expect(worker.envFrom[1].secretRef.name).toBe('preflyt-worker-secrets')
  })
  it('retains database and queue storage and preserves active coordination locks', () => {
    for (const name of ['db', 'queue']) {
      const set = get('StatefulSet', name)
      expect(set.spec.persistentVolumeClaimRetentionPolicy).toEqual({
        whenDeleted: 'Retain',
        whenScaled: 'Retain',
      })
      expect(set.spec.volumeClaimTemplates[0].spec.accessModes).toEqual([
        'ReadWriteOnce',
      ])
      expect(set.spec.template.spec.containers[0].image).toBe(
        compose.services[name].image,
      )
    }
    expect(pod('StatefulSet', 'queue').containers[0].command).toEqual(
      compose.services.queue.command,
    )
    expect(pod('Deployment', 'cache').containers[0].command).toEqual(
      compose.services.cache.command,
    )
    expect(
      pod('Deployment', 'cache').volumes.find(
        (volume: any) => volume.name === 'data',
      ).emptyDir,
    ).toBeDefined()
    expect(
      pod('StatefulSet', 'db').containers[0].readinessProbe.exec.command,
    ).toContain('127.0.0.1')
    expect(get('ConfigMap', 'preflyt-db-init').data['01-runtime-role.sh']).toBe(
      readFileSync(resolve(root, 'deploy/postgres/01-runtime-role.sh'), 'utf8'),
    )
  })
  it('does not grant platform pods host, runtime or cluster authority', () => {
    expect(
      docs.some((doc) =>
        ['Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding'].includes(
          doc.kind,
        ),
      ),
    ).toBe(false)
    for (const spec of allPods) {
      expect(spec.automountServiceAccountToken).toBe(false)
      expect(spec.securityContext.runAsNonRoot).toBe(true)
      expect(spec.securityContext.seccompProfile.type).toBe('RuntimeDefault')
      expect(spec.hostNetwork).toBeUndefined()
      expect(spec.hostPID).toBeUndefined()
      expect(spec.volumes.every((volume: any) => !volume.hostPath)).toBe(true)
      for (const container of spec.containers) {
        expect(container.securityContext.allowPrivilegeEscalation).toBe(false)
        expect(container.securityContext.readOnlyRootFilesystem).toBe(true)
        expect(container.securityContext.capabilities.drop).toEqual(['ALL'])
        expect(container.resources.limits.memory).toBeDefined()
      }
    }
  })
  it('uses internal services and restricts database/cache clients', () => {
    for (const service of docs.filter((doc) => doc.kind === 'Service'))
      expect(service.spec.type ?? 'ClusterIP').toBe('ClusterIP')
    for (const name of ['db', 'queue', 'cache']) {
      const policy = get('NetworkPolicy', name + '-clients')
      const clients =
        policy.spec.ingress[0].from[0].podSelector.matchExpressions[0].values
      expect(clients).toEqual(
        name === 'db' ? ['api', 'worker', 'migrate'] : ['api', 'worker'],
      )
    }
  })
  it('keeps native checks and external integrations opt-in without embedded secrets', () => {
    const config = get('ConfigMap', 'preflyt-config').data
    for (const flag of [
      'NATIVE_PREFLIGHT_ENABLED',
      'GITHUB_LOGIN_ENABLED',
      'GITHUB_EVENTS_ENABLED',
      'AUTOMATIC_CHECK_PUBLICATION_ENABLED',
    ])
      {
        expect(config[flag]).toBeUndefined()
        expect(configurationFields.find(field => field.key === flag)?.defaultValue).toBe('false')
      }
    expect(config.COOKIE_SECURE).toBe('true')
    expect(docs.some((doc) => doc.kind === 'Secret')).toBe(false)
    expect(
      get('Namespace', 'preflyt').metadata.labels[
        'pod-security.kubernetes.io/enforce'
      ],
    ).toBe('restricted')
  })
})
