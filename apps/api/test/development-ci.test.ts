import { nativeImages } from '../../../scripts/ci/local-images.mjs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
const root = resolve(process.cwd(), '../..')
const workflow = (name: string) => parse(readFileSync(resolve(root, '.github/workflows', name), 'utf8'))
it('requires explicit dispatch for every hosted workflow and disables Preflyt Action', () => {
  for (const file of readdirSync(resolve(root, '.github/workflows')).filter(name => /\.ya?ml$/.test(name))) {
    const config = workflow(file)
    expect(Object.keys(config.on), file).toContain('workflow_dispatch')
    expect(Object.keys(config.on).every(event => ['workflow_dispatch', 'workflow_call'].includes(event)), file).toBe(true)
    for (const job of Object.values(config.jobs) as any[]) {
      for (const step of job.steps ?? []) expect(step.uses ?? '', file).not.toContain('preflyt-action@')
    }
  }
  expect(workflow('verify.yml').jobs.preflyt_gate).toBeUndefined()
  expect(workflow('development-checks.yml').jobs.checks.permissions).toEqual({ contents: 'read' })
})
it.each([['development', 'development'], ['production', 'main']])('publishes %s only manually from its own branch without invoking hosted tests', (environment, branch) => {
  const publish = workflow(`publish-${environment}.yml`)
  expect(publish.on).toEqual({ workflow_dispatch: null })
  expect(publish.permissions).toEqual({ contents: 'read' })
  expect(publish.concurrency['cancel-in-progress']).toBe(false)
  expect(publish.jobs.branch.steps[0].env.PUBLICATION_REF).toBe('${{ github.ref }}')
  expect(publish.jobs.branch.steps[0].run).toBe(`test "$PUBLICATION_REF" = refs/heads/${branch}`)
  expect(publish.jobs.build.needs).toBe('branch')
  expect(publish.jobs.build.strategy.matrix.group).toEqual(['api', 'web'])
  expect(publish.jobs.build.strategy.matrix.platform).toEqual([{ arch: 'amd64', runner: 'ubuntu-24.04' }, { arch: 'arm64', runner: 'ubuntu-24.04-arm' }])
  expect(publish.jobs.publish.needs).toBe('build')
  for (const job of Object.values(publish.jobs) as any[]) {
    expect(job.uses).toBeUndefined() // no transitive regression/Compose calls
    for (const step of job.steps ?? []) {
      expect(step.run ?? '').not.toMatch(/--test|vitest|playwright|compose|pnpm.*test/)
      if (step.uses?.startsWith('actions/checkout@')) {
        expect(step.with.ref).toBe('${{ github.sha }}')
        expect(step.with['persist-credentials']).toBe(false)
      }
    }
  }
  expect(publish.jobs.build.steps.some((step: any) => step.run?.includes('publish-release.mjs build'))).toBe(true)
  expect(publish.jobs.publish.steps.some((step: any) => step.run === 'node scripts/ci/publish-release.mjs manifest')).toBe(true)
  if (environment === 'production') {
    expect(publish.jobs.release.needs).toEqual(['branch', 'publish'])
    expect(publish.jobs.release.steps.at(-1).env.PREFLYT_BUILD_VERSION).toBe('${{ needs.branch.outputs.version }}')
    expect(publish.jobs.release.if).toContain("github.event_name == 'workflow_dispatch'")
    expect(publish.jobs.release.if).toContain("github.ref == 'refs/heads/main'")
    expect(publish.jobs.release.permissions).toEqual({ contents: 'write', packages: 'write' })
    expect(publish.jobs.release.steps.at(-1).run).toBe('node scripts/ci/create-release.mjs')
  } else expect(publish.jobs.release).toBeUndefined()
})
it('retains explicit manual regression, native fixtures and Compose acceptance separately from publishing', () => {
  const native = workflow('publish-native.yml')
  expect(Object.entries(nativeImages)).toEqual(native.jobs['publish-native'].strategy.matrix.include.map((item:any)=>['preflyt-native-'+item.tool,[item.dockerfile,item.target]]))
  const steps = native.jobs['publish-native'].steps
  const test = steps.findIndex((step: any) => step.name === 'Verify the exact image with generated source')
  const push = steps.findIndex((step: any) => step.name === 'Publish only the verified image')
  expect(test).toBeGreaterThan(0)
  expect(push).toBeGreaterThan(test)
  const verify = workflow('verify.yml')
  expect(verify.jobs.main.uses).toBe('./.github/workflows/main-regression.yml')
  expect(verify.jobs.development.uses).toBe('./.github/workflows/development-checks.yml')
  const regression = workflow('main-regression.yml').jobs.regression
  for (const name of ['API regression', 'Browser regression']) expect(regression.steps.find((step:any)=>step.name===name).run).toContain('test')
  const compose = workflow('compose-acceptance.yml')
  expect(compose.on.workflow_dispatch.inputs.published_images.type).toBe('boolean')
  expect(compose.on.workflow_call.inputs.published_images.type).toBe('boolean')
  expect(compose.jobs.compose.steps.find((step:any)=>step.name==='Start services and wait for readiness').run).toContain('up -d --no-build --wait')
})
it('combines actual test outcomes and rejects missing or malformed current reports without reusing stale evidence', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'preflyt-ci-junit-'))
  const out = resolve(dir, 'tests.xml'), api = resolve(dir, 'api.xml'), web = resolve(dir, 'web.xml')
  const merge = () => spawnSync('python3', [resolve(root, 'scripts/ci/merge-junit.py'), out, api, web], { encoding: 'utf8' })
  try {
    writeFileSync(api, '<testsuites><testsuite><testcase name="pass"/><testcase name="failure"><failure message="failed"/></testcase><system-out>PRIVATE OUTPUT</system-out></testsuite></testsuites>')
    writeFileSync(web, '<testsuite><testcase name="skipped"><skipped/></testcase><testcase name="error"><error/></testcase></testsuite>')
    expect(merge().status).toBe(0)
    const report = readFileSync(out, 'utf8')
    expect(report.match(/<testcase/g)).toHaveLength(4)
    expect(report).toContain('failures="1"'); expect(report).toContain('errors="1"'); expect(report).toContain('skipped="1"')
    expect(report).not.toContain('PRIVATE OUTPUT')
    rmSync(web); expect(merge().status).toBe(1); expect(existsSync(out)).toBe(false)
    writeFileSync(out, 'stale'); writeFileSync(web, '<testsuite tests="1"/>')
    expect(merge().status).toBe(1); expect(existsSync(out)).toBe(false)
    writeFileSync(web, '<!DOCTYPE x><testsuite><testcase name="x"/></testsuite>')
    expect(merge().status).toBe(1); expect(existsSync(out)).toBe(false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('checks Pages configuration with a read-only build token before spending build time', () => {
  const docs = workflow('docs.yml'), steps = docs.jobs.build.steps
  expect(docs.jobs.build.permissions).toEqual({ contents: 'read', pages: 'read' })
  expect(docs.jobs.deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' })
  const pages = steps.findIndex((step: any) => step.uses?.startsWith('actions/configure-pages@'))
  expect(pages).toBeGreaterThan(0)
  expect(pages).toBeLessThan(steps.findIndex((step: any) => step.name === 'Install locked dependencies'))
  expect(steps[pages].with?.enablement).not.toBe(true)
})

it('caches complete build products and keeps TypeScript incremental state with emitted files', () => {
  const turbo = JSON.parse(readFileSync(resolve(root, 'turbo.json'), 'utf8'))
  const api = JSON.parse(readFileSync(resolve(root, 'apps/api/tsconfig.json'), 'utf8'))
  expect(api.compilerOptions.tsBuildInfoFile).toBe('./dist/.tsbuildinfo')
  expect(turbo.tasks.build.outputs).toContain('dist/**')
  expect(turbo.tasks['@preflyt/web#build'].outputs).toContain('.prerender/**')
  expect(turbo.tasks['@preflyt/web#build'].inputs).toContain('$TURBO_ROOT$/deploy/nginx.conf')
  const docs = turbo.tasks['@preflyt/docs#build']
  for (const output of ['build/**', 'static/downloads/**']) expect(docs.outputs).toContain(output)
  for (const input of ['docs/**', 'deploy/**', 'docker-compose.yaml', '.env.example']) expect(docs.inputs).toContain('$TURBO_ROOT$/' + input)
  expect(docs.env).toEqual(['DOCS_URL', 'DOCS_BASE_URL', 'PREFLYT_DOCS_REGISTRY'])
  expect(turbo.tasks.test.cache).toBe(false)
})
it('does not package the removed Health test runner in the native image', () => {
  const context = 'docs/deployment/native-runner'
  const dockerfile = readFileSync(resolve(root, context, 'Dockerfile.node'), 'utf8')
  expect(dockerfile).not.toContain('COPY coverage')
  expect(dockerfile).toContain('source-verification.mjs')
  const tracked = spawnSync('git', ['ls-files', `${context}/coverage/`], { cwd: root, encoding: 'utf8' })
  expect(tracked.status, tracked.stderr).toBe(0)
  expect(tracked.stdout.trim()).toBe('')
})

it('builds documentation at the custom domain root rather than the legacy project path', () => {
  const step = workflow('docs.yml').jobs.build.steps.find((step: any) => step.name?.startsWith('Type-check and build'))
  expect(step.env).toEqual({ DOCS_URL: 'https://docs.preflytlabs.com', DOCS_BASE_URL: '/' })
})
