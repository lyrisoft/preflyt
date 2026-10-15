import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { changedFiles, focusedCommands, imageRequired, runFocused, sourceContractTests, testPlan } from './change-scope.mjs';

test('development does not rebuild images for test, documentation or PR-check-only changes', () => {
  assert.equal(imageRequired('development', ['apps/api/test/native-source.test.ts', 'apps/web/src/homepage.test.tsx',
    'apps/web/src/test-utils/render.tsx', 'apps/web/scripts/public-build.check.mjs', 'apps/docs/src/pages/index.tsx',
    'docs/deployment/branch-ci.md', 'README.md', 'scripts/ci/change-scope.test.mjs', '.github/workflows/development-checks.yml']), false);
});
test('every deployable or qualification input triggers exact-commit development images', () => {
  for (const path of ['apps/api/src/main.ts', 'apps/api/prisma/migrations/new/migration.sql', 'apps/api/prisma.config.ts',
    'apps/web/src/style.css', 'apps/api/src/runtime.check.ts', 'apps/web/scripts/prerender.mjs', 'apps/web/public/logo.svg', 'deploy/nginx.conf',
    'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md',
    'docker-compose.yaml', 'compose.local.yaml', '.env.example', 'scripts/deploy/smoke.mjs',
    'docs/deployment/native-runner/Dockerfile.gitleaks', 'docs/deployment/native-runner/config/semgrep.yaml',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.dockerignore', 'packages/shared/index.ts',
    'patches/fix.patch', '.github/workflows/publish-images.yml', '.github/workflows/compose-acceptance.yml',
    'scripts/ci/change-scope.mjs']) assert.equal(imageRequired('development', [path]), true, path);
});
test('main always builds a new commit and new history never silently skips publication', () => {
  assert.equal(imageRequired('main', []), true);
  assert.equal(imageRequired('main', ['README.md']), true);
  assert.equal(imageRequired('development', null), true);
  assert.throws(() => imageRequired('feature', []));
});
test('focused test scope separates workspaces and broadens dependency/configuration changes', () => {
  assert.deepEqual(testPlan(['README.md']), { api: false, web: false, allApi: false, allWeb: false });
  assert.deepEqual(testPlan(['apps/api/src/github/provider.ts']), { api: true, web: false, allApi: false, allWeb: false });
  assert.deepEqual(testPlan(['apps/web/src/page.tsx']), { api: false, web: true, allApi: false, allWeb: false });
  for (const paths of [null, ['pnpm-lock.yaml'], ['packages/shared/index.ts']])
    assert.deepEqual(testPlan(paths), { api: true, web: true, allApi: true, allWeb: true });
  assert.equal(testPlan(['apps/api/test/setup.ts']).allApi, true);
  assert.equal(testPlan(['apps/api/vitest.config.ts']).allApi, true);
  assert.equal(testPlan(['apps/web/vite.config.ts']).allWeb, true);
});
test('related tests use the verified comparison, exclude DB integration only on development, and preserve failure', () => {
  const scope = { paths: ['apps/api/src/main.ts', 'apps/web/src/page.tsx'], base: 'a'.repeat(40) };
  const api = focusedCommands('api', scope)[0], web = focusedCommands('web', scope)[0];
  assert.ok(api.includes(`--changed=${scope.base}`));
  assert.ok(api.includes('**/*.integration.test.ts'));
  for (const path of sourceContractTests) assert.ok(api.includes(path));
  assert.ok(web.includes('--browser.headless'));
  assert.equal(runFocused('api', scope, () => ({ status: 7 })), 7);
  assert.equal(runFocused('api', scope, () => ({ status: null })), 1);
  assert.throws(() => runFocused('api', scope, () => ({ error: new Error('launch failed') })), /launch failed/);
  assert.equal(runFocused('web', { paths: ['README.md'], base: scope.base }, () => assert.fail()), 0);
  assert.ok(!focusedCommands('api', { paths: ['pnpm-lock.yaml'], base: scope.base })[0].some(arg => arg.startsWith('--changed')));
  assert.throws(() => focusedCommands('invalid', scope));
});
test('exact SHA validation and unavailable comparisons fail before test or publication decisions', () => {
  const head = 'b'.repeat(40);
  assert.throws(() => changedFiles({ CI_HEAD_SHA: 'main' }, () => assert.fail()));
  assert.throws(() => changedFiles({ CI_HEAD_SHA: head, CI_BASE_SHA: '$(unsafe)' }, () => head));
  assert.throws(() => changedFiles({ CI_HEAD_SHA: head }, () => 'c'.repeat(40)), /Checkout differs/);
  assert.throws(() => changedFiles({ CI_HEAD_SHA: head, CI_BASE_SHA: 'a'.repeat(40) }, args => {
    if (args[0] === 'rev-parse') return head;
    throw new Error('Comparison unavailable');
  }), /Comparison unavailable/);
  assert.deepEqual(changedFiles({ CI_HEAD_SHA: head, CI_BASE_SHA: '0'.repeat(40) }, () => head), { paths: null, base: null });
});
test('real Git diffs retain deleted/renamed inputs and use the PR merge base instead of unrelated base changes', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'preflyt-ci-scope-'));
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const commit = message => { git(['add', '.']); git(['commit', '--quiet', '-m', message]); return git(['rev-parse', 'HEAD']).trim(); };
  const script = resolve('scripts/ci/change-scope.mjs');
  try {
    git(['init', '--quiet', '-b', 'base']); git(['config', 'user.name', 'CI fixture']); git(['config', 'user.email', 'ci@example.invalid']);
    mkdirSync(resolve(dir, 'apps/api/src'), { recursive: true });
    writeFileSync(resolve(dir, 'apps/api/src/old.ts'), 'export const source = 1;');
    const initial = commit('initial');
    git(['checkout', '--quiet', '-b', 'feature']);
    git(['mv', 'apps/api/src/old.ts', 'README.md']);
    const head = commit('rename runtime file to docs');
    git(['checkout', '--quiet', 'base']); writeFileSync(resolve(dir, 'unrelated.md'), 'base only'); const base = commit('base advanced');
    git(['checkout', '--quiet', 'feature']);
    const scope = changedFiles({ CI_BASE_SHA: base, CI_HEAD_SHA: head, GITHUB_EVENT_NAME: 'pull_request' }, git);
    assert.equal(scope.base, initial);
    assert.deepEqual(scope.paths.sort(), ['README.md', 'apps/api/src/old.ts']);
    assert.equal(imageRequired('development', scope.paths), true);
    const output = resolve(dir, 'outputs'), summary = resolve(dir, 'summary');
    const result = spawnSync(process.execPath, [script, 'images'], { cwd: dir, encoding: 'utf8', env: {
      ...process.env, CI_BASE_SHA: initial, CI_HEAD_SHA: head, GITHUB_REF_NAME: 'development', GITHUB_EVENT_NAME: 'push',
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
    } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, 'utf8'), 'publish=true\n');
    assert.match(readFileSync(summary, 'utf8'), /exact-commit images/);
    writeFileSync(resolve(dir, 'README.md'), 'docs only'); const docsHead = commit('docs only');
    for (const [branch, expected] of [['development', 'false'], ['main', 'true']]) {
      writeFileSync(output, ''); writeFileSync(summary, '');
      const docsResult = spawnSync(process.execPath, [script, 'images'], { cwd: dir, encoding: 'utf8', env: {
        ...process.env, CI_BASE_SHA: head, CI_HEAD_SHA: docsHead, GITHUB_REF_NAME: branch, GITHUB_EVENT_NAME: 'push',
        GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary,
      } });
      assert.equal(docsResult.status, 0, docsResult.stderr);
      assert.equal(readFileSync(output, 'utf8'), `publish=${expected}\n`);
      if (branch === 'development') assert.match(readFileSync(summary, 'utf8'), /No new commit image tags/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('service-backed API suites are integration tests and main retains the full suite', () => {
  for (const name of ['github-worker', 'github-event-queue', 'redis-cache']) {
    assert.ok(readFileSync(`apps/api/test/${name}.integration.test.ts`, 'utf8').length > 0);
  }
  const config = readFileSync('apps/api/vitest.config.ts', 'utf8');
  assert.match(config, /include: \[\s*'test\/\*\*\/\*\.test\.ts'\s*\]/);
  const full = focusedCommands('api', { paths: null, base: null })[0];
  const related = focusedCommands('api', { paths: ['apps/api/src/main.ts'], base: 'a'.repeat(40) })[0];
  for (const args of [full, related]) assert.equal(args[args.indexOf('--exclude') + 1], '**/*.integration.test.ts');
  const main = readFileSync('.github/workflows/main-regression.yml', 'utf8');
  assert.match(main, /services:/);
  assert.match(main, /TEST_QUEUE_REDIS_URL:/);
  assert.match(main, /API regression[\s\S]*pnpm --filter @preflyt\/api test --reporter/);
  assert.ok(!main.includes('--exclude'));
});
