import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseAllDocuments, parse } from 'yaml'
const read = (path: string) =>
  readFileSync(new URL('../../../' + path, import.meta.url), 'utf8')
it('gives a separate launcher only bounded sandbox resource authority, without changing observer or application identities', () => {
  const objects = parseAllDocuments(
    read('docs/deployment/native-runner/kubernetes-launcher-rbac.yaml'),
  ).map((d) => d.toJSON())
  const role = objects.find((o: any) => o.kind === 'Role')
  expect(role.metadata.namespace).toBe('preflyt-sandbox-reviewed')
  expect(role.rules.flatMap((r: any) => r.resources).sort()).toEqual([
    'configmaps',
    'jobs',
    'pods',
    'pods/log',
  ])
  expect(role.rules.flatMap((r: any) => r.verbs)).not.toContain('*')
  const account = objects.find((o: any) => o.kind === 'ServiceAccount')
  expect(account.metadata.name).toBe('preflyt-native-launcher')
  for (const binding of objects.filter((o: any) => o.kind.endsWith('Binding')))
    expect(binding.subjects).toEqual([
      {
        kind: 'ServiceAccount',
        name: 'preflyt-native-launcher',
        namespace: 'preflyt-controller',
      },
    ])
  const observer = parseAllDocuments(
    read('docs/deployment/native-preflight/observer-rbac.yaml'),
  )
    .map((d) => d.toJSON())
    .find((o: any) => o.kind === 'Role')
  expect(
    observer.rules
      .flatMap((r: any) => r.verbs)
      .every((v: string) => ['get', 'list'].includes(v)),
  ).toBe(true)
})
it('keeps preflight observation-only and requires an explicit protected execution override', () => {
  const base = parse(read('docs/deployment/native-preflight/compose.yaml'))
  expect(base.services.controller.read_only).toBe(true)
  expect(
    read('docs/deployment/native-preflight/controller.env.example'),
  ).toContain('NATIVE_EXECUTION_ENABLED=false')
  const override = parse(
    read('docs/deployment/native-runner/kubernetes-controller.execution.yaml'),
  ).services.controller
  expect(override.environment.NATIVE_EXECUTION_ENABLED).toBe('true')
  expect(
    override.volumes.every((v: any) => v.bind.create_host_path === false),
  ).toBe(true)
  expect(
    override.volumes.some((v: any) => v.source.includes('docker.sock')),
  ).toBe(false)
  for (const tool of ['node', 'gitleaks', 'semgrep', 'trivy'])
    expect(read('docs/deployment/native-runner/Dockerfile.' + tool)).toContain(
      'source-initializer.mjs',
    )
})
