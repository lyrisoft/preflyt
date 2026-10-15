import { nativeImages } from '../../../scripts/ci/local-images.mjs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'
import { expect, it } from 'vitest'
const root = resolve(process.cwd(), '../..')
const workflow = (name: string) => parse(readFileSync(resolve(root, '.github/workflows', name), 'utf8'))
it('checks the PR head and runs the published policy only for same-repository development PRs', () => {
  const verify = workflow('verify.yml')
  const development = workflow('development-checks.yml')
  const steps = development.jobs.checks.steps, sourceSteps = development.jobs.source.steps, allSteps = [...steps, ...sourceSteps]
  expect(steps[0].with.ref).toContain('github.event.pull_request.head.sha')
  expect(steps[0].with['persist-credentials']).toBe(false)
  expect(steps[0].with['fetch-depth']).toBe(0)
  const action = steps.find((step: any) => step.name === 'Preflyt development policy')
  expect(action.if).toContain("github.base_ref == 'development'")
  expect(action.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
  expect(action.if).toContain('!cancelled()')
  expect(action.uses).toMatch(/^lyrisoft\/preflyt-action@[a-f0-9]{40}$/)
  expect(action.with).toEqual({ 'api-url': '${{ vars.PREFLYT_API_URL }}', 'coverage-reports': '[{"path":"apps/web/coverage/lcov.info","prefix":"apps/web"}]', 'coverage-artifact': 'preflyt-coverage-api-${{ github.run_id }}-${{ github.run_attempt }}' })
  expect(action.env.PREFLYT_COLLECT_COVERAGE).toBe('true')
  expect(verify.jobs.preflyt_gate.steps[0].uses).toBe(action.uses)
  expect(development.jobs.checks.permissions).toEqual({ contents: 'read', actions: 'read', 'id-token': 'write' })
  for (const name of ['Type checks', 'Lint', 'Build validation']) expect(allSteps.find((step: any) => step.name === name).if).toContain('!cancelled()')
  expect(development.jobs.checks.services).toBeUndefined()
  expect(steps.some((step: any) => /regression|compose/i.test(step.name ?? ''))).toBe(false)
  const api = sourceSteps.find((step: any) => step.name === 'API unit tests and coverage')
  expect(api.if).toBe('${{ !cancelled() }}')
  expect(api.run).toContain("vitest run --exclude '**/*.integration.test.ts'")
  expect(api.run).not.toContain('--changed')
  expect(api.env.PREFLYT_COLLECT_COVERAGE).toBe('true')
  expect(sourceSteps.filter((step: any) => /vitest|test\/.*\.test\.ts/.test(step.run ?? ''))).toHaveLength(1)
  const upload = sourceSteps.find((step: any) => step.name === 'Upload API coverage from this execution')
  expect(upload.if).toContain('success()')
  expect(upload.with.name).toContain('${{ github.run_attempt }}')
  expect(upload.with['retention-days']).toBe(1)
  const focused = steps.find((step: any) => step.name === 'Related browser tests')
  expect(focused.if).toContain("steps.focused.outputs.web == 'true'")
  expect(focused.run).toBe('node scripts/ci/change-scope.mjs web')
  expect(development.jobs.source.needs).toBeUndefined()
  expect(development.jobs.checks.needs).toBeUndefined()
  expect(development.jobs.source.permissions).toBeUndefined() // inherits read-only contents, no OIDC
  const policyIndex = steps.findIndex((step: any) => step.name === 'Preflyt development policy')
  const coverageIndex = steps.findIndex((step: any) => step.name === 'Check current policy browser coverage')
  expect(coverageIndex).toBeGreaterThan(policyIndex)
  expect(steps[coverageIndex].run).toBe('python3 scripts/ci/policy-browser-coverage.py')
  for (const name of ['Install Chromium for related browser tests', 'Related browser tests']) {
    expect(steps.find((step: any) => step.name === name).if).toContain("steps.browser.outputs.covered != 'true'")
  }
  const cacheSteps = steps.filter((step: any) => step.uses?.startsWith('actions/cache@'))
  expect(cacheSteps.map((step: any) => step.with.path)).toEqual(['.turbo/cache', '~/.cache/ms-playwright'])
  expect(cacheSteps.every((step: any) => !step.with.path.includes('.preflyt'))).toBe(true)
  expect(verify.jobs.development.uses).toBe('./.github/workflows/development-checks.yml')
})
it('builds release images only after a push, without repeating PR checks', () => {
  const verify = workflow('verify.yml'), publish = workflow('publish-images.yml')
  expect(verify.jobs.images).toBeUndefined()
  expect(verify.permissions.packages).toBeUndefined()
  expect(publish.on.push.branches).toEqual(['development', 'main'])
  expect(publish.on.pull_request).toBeUndefined()
  expect(publish.on.workflow_dispatch).toBeUndefined()
  expect(publish.jobs.verify).toBeUndefined()
  expect(publish.on.push.paths).toBeUndefined() // main must publish even for a test/docs-only commit
  expect(publish.jobs.inputs.permissions?.packages).toBeUndefined()
  expect(publish.jobs.inputs.steps[0].with['persist-credentials']).toBe(false)
  const disk = publish.jobs.build.steps.findIndex((step:any)=>step.name==='Ensure API build disk headroom')
  expect(disk).toBeGreaterThan(0)
  expect(publish.jobs.build.steps[disk].if).toBe("matrix.group == 'api' && matrix.platform.arch == 'amd64'")
  expect(publish.jobs.build.steps[disk].run).toBe('node scripts/ci/prepare-image-build.mjs')
  expect(disk).toBeLessThan(publish.jobs.build.steps.findIndex((step:any)=>step.uses?.startsWith('docker/setup-buildx-action@')))
  expect(publish.jobs.build.needs).toBe('inputs')
  expect(publish.jobs.build.if).toBe("${{ needs.inputs.outputs.publish == 'true' }}")
  expect(publish.jobs.publish.needs).toBe('build')
  expect(publish.jobs.build.strategy.matrix.group).toEqual(['api', 'web'])
  expect(publish.jobs.build.strategy.matrix.platform).toEqual([{ arch: 'amd64', runner: 'ubuntu-24.04' }, { arch: 'arm64', runner: 'ubuntu-24.04-arm' }])
  expect(publish.jobs.build.steps.some((step: any) => step.uses?.startsWith('docker/setup-qemu'))).toBe(false)
  expect(publish.jobs['accept-published'].needs).toBe('publish')
  expect(publish.jobs['accept-published'].if).toBeUndefined()
  expect(publish.jobs['accept-published'].with.published_images).toBe(true)
})
it('builds and fixture-verifies native tools only when their inputs change', () => {
  const native = workflow('publish-native.yml')
  expect(native.on.pull_request).toBeUndefined()
  expect(native.on.push.branches).toEqual(['development', 'main'])
  for (const path of ['docs/deployment/native-runner/**', 'apps/api/scripts/native-check-fixtures.mts', 'pnpm-lock.yaml']) expect(native.on.push.paths).toContain(path)
  expect(native.on.push.paths).not.toContain('apps/web/**')
  expect(Object.entries(nativeImages)).toEqual(native.jobs['publish-native'].strategy.matrix.include.map((item:any)=>['preflyt-native-'+item.tool,[item.dockerfile,item.target]]))
  const steps = native.jobs['publish-native'].steps
  const manager = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).packageManager
  expect(steps.find((step:any)=>step.name==='Install locked fixture dependencies').run).toContain('npm install --global '+manager)
  const test = steps.findIndex((step: any) => step.name === 'Verify the exact image with generated source')
  const push = steps.findIndex((step: any) => step.name === 'Publish only the verified image')
  expect(test).toBeGreaterThan(0)
  expect(push).toBeGreaterThan(test)
  expect(steps[push].if).not.toContain('always()')
  expect(workflow('publish-images.yml').jobs['publish-native']).toBeUndefined()
})
it('tests the published commit images without rebuilding and keeps docs off PRs', () => {
  const compose = workflow('compose-acceptance.yml')
  const steps = compose.jobs.compose.steps
  const start = steps.find((step: any) => step.name === 'Build or pull the required images').run
  const published = start.split('else')[0]
  expect(published).toContain('pull')
  expect(published).toContain('org.opencontainers.image.revision')
  expect(published).toContain('test "$revision" = "$GITHUB_SHA"')
  expect(published).not.toContain('compose.local.yaml build')
  expect(start).not.toContain('up -d')
  expect(steps.find((step:any)=>step.name==='Start services and wait for readiness').run).toContain('up -d --no-build --wait')
  expect(workflow('docs.yml').on.pull_request).toBeUndefined()
  expect(workflow('docs.yml').on.push.branches).toEqual(['main'])
})
it('routes each branch to its own verification and blocks image builds when that verification fails', () => {
  const verify = workflow('verify.yml'), main = workflow('main-regression.yml')
  expect(verify.on.pull_request.branches).toEqual(['development', 'main'])
  expect(verify.jobs.scope.steps[0].run).toContain('*)')
  expect(verify.jobs.scope.steps[0].run).toContain('exit 1')
  expect(verify.jobs.main.uses).toBe('./.github/workflows/main-regression.yml')
  expect(verify.jobs.main.if).toBe("${{ (github.base_ref || github.ref_name) == 'main' }}")
  expect(verify.jobs.development.if).toBe("${{ (github.base_ref || github.ref_name) == 'development' }}")
  for (const branch of ['development', 'main']) expect(verify.jobs[branch].needs).toBe('scope')
  expect(main.jobs['compose-smoke']).toBeUndefined()
  for (const name of ['API regression', 'Browser regression']) expect(main.jobs.regression.steps.find((step: any) => step.name === name).if).toContain('!cancelled()')
  expect(main.jobs.regression.steps.some((step: any) => step.name === 'Preflyt development policy')).toBe(false)

})
it('chains the final gate to check jobs in the PR workflow, leaving docs separate', () => {
  const verify = workflow('verify.yml'), gate = verify.jobs.preflyt_gate;
  expect(gate.needs).toEqual(['scope', 'development', 'main']);
  expect(gate.if).toContain('always()');
  expect(gate.name).toBe('Preflyt final gate');
  expect(gate.steps[0].with.mode).toBe('gate');
  expect(existsSync(resolve(root, '.github/workflows/preflyt-gate.yml'))).toBe(false);
  expect(existsSync(resolve(root, '.github/workflows/docs.yml'))).toBe(true);
});
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
