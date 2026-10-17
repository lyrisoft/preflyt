import { describe, expect, it } from 'vitest'
import {
  discoverRepositoryProfile,
  type RepositorySnapshot,
} from '../src/github/repository-profile.js'
const base = (): RepositorySnapshot => ({
  sourceSha: 'a'.repeat(40),
  treeSha: 'b'.repeat(40),
  branch: 'main',
  fullName: 'fixture/app',
  complete: true,
  warnings: [],
  files: [],
})
const signal = (snapshot: RepositorySnapshot, id: string) =>
  discoverRepositoryProfile(snapshot).signals.find((item) => item.id === id)!

describe('repository engineering profile', () => {
  it('keeps representative evidence for every language and framework within display limits', () => {
    const snapshot = base()
    snapshot.files = Array.from({ length: 25 }, (_, index) => ({
      path: 'web/' + index + '.ts',
      sha: 'c'.repeat(40),
      size: 1,
    }))
    snapshot.files.push({ path: 'api/main.go', sha: 'd'.repeat(40), size: 1 })
    snapshot.files.push(
      ...Array.from({ length: 25 }, (_, index) => ({
        path: 'web/' + index + '/package.json',
        sha: 'e'.repeat(40),
        size: 30,
        content: '{"dependencies":{"react":"1"}}',
      })),
    )
    snapshot.files.push({
      path: 'api/package.json',
      sha: 'f'.repeat(40),
      size: 30,
      content: '{"dependencies":{"express":"1"}}',
    })
    expect(
      signal(snapshot, 'languages').evidence.some(
        (file) => file.path === 'api/main.go',
      ),
    ).toBe(true)
    expect(
      signal(snapshot, 'frameworks').evidence.some(
        (file) => file.path === 'api/package.json',
      ),
    ).toBe(true)
    expect(signal(snapshot, 'frameworks').evidence).toHaveLength(20)
  })
  it('reports Node framework/test hints with exact blob evidence without retaining source content', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: 'apps/api/package.json',
        sha: 'c'.repeat(40),
        size: 100,
        content: JSON.stringify({
          dependencies: { '@nestjs/core': '1' },
          devDependencies: { vitest: '1' },
          scripts: { test: 'vitest run' },
        }),
      },
      { path: 'src/main.ts', sha: 'd'.repeat(40), size: 1 },
      { path: 'pnpm-lock.yaml', sha: 'e'.repeat(40), size: 1 },
    ]
    expect(signal(snapshot, 'frameworks')).toMatchObject({
      state: 'detected',
      observations: ['NestJS'],
      evidence: [{ path: 'apps/api/package.json', blobSha: 'c'.repeat(40) }],
    })
    expect(signal(snapshot, 'tests').state).toBe('detected')
    expect(signal(snapshot, 'ci').state).toBe('not_detected')
    expect(JSON.stringify(discoverRepositoryProfile(snapshot))).not.toContain(
      'vitest run',
    )
  })
  it('never reports absent controls when the tree is partial', () => {
    const snapshot = { ...base(), complete: false }
    expect(signal(snapshot, 'ci').state).toBe('unknown')
    expect(signal(snapshot, 'tests').state).toBe('unknown')
    expect(signal(snapshot, 'trivy').state).toBe('unknown')
  })
  it('marks malformed and unread manifests unknown and ignores generated/vendor hints', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: 'package.json',
        sha: 'c'.repeat(40),
        size: 1,
        content: '{broken',
      },
      {
        path: 'node_modules/next/package.json',
        sha: 'd'.repeat(40),
        size: 1,
        content: '{"dependencies":{"next":"1"}}',
      },
      { path: 'dist/app.spec.js', sha: 'e'.repeat(40), size: 1 },
    ]
    expect(signal(snapshot, 'frameworks').state).toBe('unknown')
    expect(signal(snapshot, 'tests').state).toBe('unknown')
    expect(discoverRepositoryProfile(snapshot).complete).toBe(false)
  })
  it('treats scanner references as hints and unread workflows as unknown coverage', () => {
    const snapshot = base()
    snapshot.files = [
      {
        path: '.github/workflows/security.yml',
        sha: 'c'.repeat(40),
        size: 10,
        content: 'uses: aquasecurity/trivy-action@v1',
      },
    ]
    expect(signal(snapshot, 'trivy').state).toBe('detected')
    expect(signal(snapshot, 'gitleaks').state).toBe('not_detected')
    snapshot.files[0]!.content = undefined
    expect(signal(snapshot, 'trivy').state).toBe('unknown')
    expect(discoverRepositoryProfile(snapshot).warnings.join(' ')).toContain(
      'coverage remains incomplete',
    )
  })
})

it('does not mark unrelated file links or ignored directories partial', () => {
  const snapshot = base()
  snapshot.omittedPaths = [
    { path: 'AGENTS.md', kind: 'symlink', scope: 'file', reason: 'File link not followed.' },
    { path: 'vendor/dependency', kind: 'submodule', scope: 'directory', reason: 'Submodule not traversed.' },
  ]
  const result = discoverRepositoryProfile(snapshot)
  expect(result.complete).toBe(true)
  expect(result.omittedPaths.every((item) => item.affectedChecks.length === 0)).toBe(true)
  expect(result.signals.find((item) => item.id === 'ownership')!.state).toBe('not_detected')
})
it('marks only affected missing checks unknown and retains paths and reasons', () => {
  const snapshot = base()
  snapshot.omittedPaths = [{ path: 'package.json', kind: 'symlink', scope: 'file', reason: 'File link not followed.' }]
  const result = discoverRepositoryProfile(snapshot)
  expect(result.complete).toBe(false)
  expect(result.omittedPaths[0]).toMatchObject({ path: 'package.json', reason: 'File link not followed.', affectedChecks: expect.arrayContaining(['manifests','frameworks','tests']) })
  expect(result.signals.find((item) => item.id === 'manifests')!.state).toBe('unknown')
  expect(result.signals.find((item) => item.id === 'ownership')!.state).toBe('not_detected')
})
it.each(['directory','unknown'] as const)('keeps potentially relevant omitted %s content partial', (scope) => {
  const snapshot = base()
  snapshot.omittedPaths = [{ path: 'packages/shared', kind: 'symlink', scope, reason: 'Target not traversed.' }]
  expect(discoverRepositoryProfile(snapshot).complete).toBe(false)
  expect(discoverRepositoryProfile(snapshot).omittedPaths[0].affectedChecks).toContain('frameworks')
})

it('excludes installed agent skill links and scripts from application profile checks', () => {
 const snapshot = base()
 snapshot.files = [{path:'.agents/skills/tool/helper.py',sha:'c'.repeat(40),size:1}]
 snapshot.omittedPaths = [{path:'.claude/skills/impeccable',kind:'symlink',scope:'directory',reason:'Directory link.',affectedChecks:['languages']}]
 const result = discoverRepositoryProfile(snapshot)
 expect(result.complete).toBe(true)
 expect(result.omittedPaths[0].affectedChecks).toEqual([])
 expect(result.signals.find(s=>s.id==='languages')!.observations).toEqual([])
 expect(result.omittedPaths[0].reason).toContain('outside supported application profile scope')
})

describe('infrastructure and additional language file hints', () => {
  it.each([
    ['schema.proto', 'Protocol Buffers'],
    ['schema.graphql', 'GraphQL'],
    ['query.gql', 'GraphQL'],
    ['app.zig', 'Zig'],
    ['main.jl', 'Julia'],
    ['Contract.sol', 'Solidity'],
    ['main.bicepparam', 'Bicep'],
    ['main.tf', 'Terraform'],
    ['modules/main.tf.json', 'Terraform'],
    ['env/prod.tfvars', 'Terraform'],
    ['env/prod.tfvars.json', 'Terraform'],
    ['terragrunt.hcl', 'HCL'],
    ['deploy/service.yaml', 'YAML'],
    ['deploy/service.yml', 'YAML'],
    ['deploy/SERVICE.YAML', 'YAML'],
    ['main.bicep', 'Bicep'],
    ['config.nix', 'Nix'],
    ['main.jsonnet', 'Jsonnet'],
    ['helpers.libsonnet', 'Jsonnet'],
    ['schema.cue', 'CUE'],
    ['index.mts', 'TypeScript'],
    ['index.cts', 'TypeScript'],
    ['index.mjs', 'JavaScript'],
    ['index.cjs', 'JavaScript'],
    ['types.pyi', 'Python'],
    ['script.pyw', 'Python'],
    ['build.gradle.kts', 'Kotlin'],
    ['main.cc', 'C++'],
    ['main.cxx', 'C++'],
    ['main.C', 'C++'],
    ['include/api.h', 'C/C++'],
    ['include/api.hpp', 'C++'],
    ['app.dart', 'Dart'],
    ['app.scala', 'Scala'],
    ['app.exs', 'Elixir'],
    ['app.erl', 'Erlang'],
    ['app.hs', 'Haskell'],
    ['app.clj', 'Clojure'],
    ['app.cljs', 'ClojureScript'],
    ['app.lua', 'Lua'],
    ['analysis.R', 'R'],
    ['deploy.sh', 'Shell'],
    ['deploy.bash', 'Shell'],
    ['deploy.zsh', 'Shell'],
    ['deploy.fish', 'Fish'],
    ['deploy.ps1', 'PowerShell'],
    ['modules.psm1', 'PowerShell'],
    ['schema.sql', 'SQL'],
    ['index.html', 'HTML'],
    ['main.css', 'CSS'],
    ['main.scss', 'SCSS'],
    ['main.sass', 'Sass'],
    ['main.less', 'Less'],
    ['App.vue', 'Vue'],
    ['App.svelte', 'Svelte'],
    ['main.fs', 'F#'],
    ['main.pl', 'Perl'],
    ['build.gradle', 'Groovy'],
  ])('detects %s as %s with exact file evidence', (path, language) => {
    const snapshot = {
      ...base(),
      files: [{ path, sha: 'c'.repeat(40), size: 1 }],
    }
    expect(signal(snapshot, 'languages')).toMatchObject({
      state: 'detected',
      observations: [language],
      evidence: [{ path, blobSha: 'c'.repeat(40) }],
    })
    expect(signal(snapshot, 'frameworks').observations).toEqual([])
  })
  it('recognizes Terraform JSON infrastructure without treating arbitrary JSON or YAML as Terraform or Kubernetes', () => {
    const snapshot = {
      ...base(),
      files: ['main.tf.json', 'data/settings.json', 'deploy.yaml'].map(
        (path) => ({ path, sha: 'c'.repeat(40), size: 1 })
      ),
    }
    expect(signal(snapshot, 'iac').evidence.map((file) => file.path)).toEqual([
      'main.tf.json',
    ])
    expect(signal(snapshot, 'languages').observations).toEqual([
      'Terraform',
      'YAML',
    ])
    expect(signal(snapshot, 'frameworks').observations).toEqual([])
  })
  it('keeps ignored dependencies, generated output and installed skills outside language detection', () => {
    const snapshot = {
      ...base(),
      files: [
        '.terraform/modules/example/main.tf',
        '.terragrunt-cache/example/main.tf',
        'vendor/main.tf',
        'node_modules/file.yaml',
        'dist/index.mjs',
        '.agents/skills/demo/example.sh',
        'README.md',
        'terraform.tfstate',
        'data.json',
        'go',
        'payload.constructor',
        'payload.__proto__',
      ].map((path) => ({ path, sha: 'c'.repeat(40), size: 1 })),
    }
    expect(signal(snapshot, 'languages').observations).toEqual([])
    expect(signal(snapshot, 'languages').state).toBe('unknown')
  })
})
