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
  const steps = development.jobs.checks.steps
  expect(steps[0].with.ref).toContain('github.event.pull_request.head.sha')
  expect(steps[0].with['persist-credentials']).toBe(false)
  const action = steps.find((step: any) => step.name === 'Preflyt development policy')
  expect(action.if).toContain("github.base_ref == 'development'")
  expect(action.if).toContain('github.event.pull_request.head.repo.full_name == github.repository')
  expect(action.if).toContain('!cancelled()')
  expect(action.uses).toBe('lyrisoft/preflyt-action@v2.1.1')
  expect(action.with).toEqual({ 'api-url': '${{ vars.PREFLYT_API_URL }}' })
  expect(verify.jobs.preflyt_gate.steps[0].uses).toBe(action.uses)
  expect(development.jobs.checks.permissions).toEqual({ contents: 'read', 'id-token': 'write' })
  for (const name of ['Type checks', 'Lint', 'Build validation']) expect(steps.find((step: any) => step.name === name).if).toContain('!cancelled()')
  expect(development.jobs.checks.services).toBeUndefined()
  expect(steps.some((step: any) => /regression|compose|Install Chromium/i.test(step.name ?? ''))).toBe(false)
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
  expect(publish.jobs.build.needs).toBeUndefined()
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
  const steps = native.jobs['publish-native'].steps
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
  const start = steps.find((step: any) => step.name === 'Build or pull and start all required services').run
  const published = start.split('else')[0]
  expect(published).toContain('pull')
  expect(published).toContain('org.opencontainers.image.revision')
  expect(published).toContain('test "$revision" = "$GITHUB_SHA"')
  expect(published).not.toContain('compose.local.yaml build')
  expect(start).toContain('up -d --no-build --wait')
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
