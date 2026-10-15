import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sha = /^[a-f0-9]{40}$/;
const sharedInputs = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.dockerignore', 'turbo.json', 'turbo.jsonc']);
const testFile = path => /^apps\/(?:api\/test|web\/(?:test|tests|src\/test-utils))\//.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || path === 'apps/web/scripts/public-build.check.mjs';
const shared = path => sharedInputs.has(path) || path.startsWith('packages/') || path.startsWith('patches/');
// These run unconditionally in the source job before related API tests.
export const sourceContractTests = ['development-ci', 'native-source', 'ci-command-report', 'pipeline-jobs', 'pipeline-gate']
  .map(name => `test/${name}.test.ts`);

export function imageRequired(branch, paths) {
  if (!['development', 'main'].includes(branch)) throw new Error('Unsupported image publication branch');
  if (branch === 'main' || paths === null) return true;
  return paths.some(path => shared(path) ||
    (/^apps\/(?:api|web)\//.test(path) && !testFile(path) && !/\/vitest\.config\./.test(path)) ||
    path.startsWith('deploy/') || path.startsWith('scripts/deploy/') ||
    path.startsWith('docs/deployment/native-runner/') ||
    ['docker-compose.yaml', 'compose.local.yaml', '.env.example', '.github/workflows/publish-images.yml', '.github/workflows/compose-acceptance.yml'].includes(path) ||
    (path.startsWith('scripts/ci/') && !testFile(path)));
}

export function testPlan(paths) {
  const all = paths === null || paths.some(shared);
  return {
    api: all || paths.some(path => path.startsWith('apps/api/')),
    web: all || paths.some(path => path.startsWith('apps/web/')),
    allApi: all || paths.some(path => /^apps\/api\/(?:package\.json|(?:vitest|tsconfig).*\.json|vitest\.config\.[^/]+|test\/setup\.ts)$/.test(path)),
    allWeb: all || paths.some(path => /^apps\/web\/(?:package\.json|(?:vite|vitest)\.config\.[^/]+|tsconfig[^/]*\.json)$/.test(path)),
  };
}

export function changedFiles(env, git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })) {
  const { CI_BASE_SHA: base, CI_HEAD_SHA: head } = env;
  if (!sha.test(head ?? '')) throw new Error('An exact checkout commit is required');
  if (git(['rev-parse', 'HEAD']).trim() !== head) throw new Error('Checkout differs from the requested commit');
  if (!base || /^0{40}$/.test(base)) return { paths: null, base: null };
  if (!sha.test(base)) throw new Error('Invalid comparison commit');
  const comparison = env.GITHUB_EVENT_NAME === 'pull_request' ? git(['merge-base', base, head]).trim() : base;
  if (!sha.test(comparison)) throw new Error('Comparison commit could not be verified');
  // Disable rename detection: both the old and new paths must influence scope.
  const paths = git(['diff', '--name-only', '--no-renames', '-z', comparison, head, '--']).split('\0').filter(Boolean);
  return { paths, base: comparison };
}

export function focusedCommands(target, scope) {
  if (!['api', 'web'].includes(target)) throw new Error('Invalid focused test target');
  const plan = testPlan(scope.paths);
  if (!plan[target]) return [];
  const full = plan[target === 'api' ? 'allApi' : 'allWeb'];
  const options = target === 'api'
    ? ['--exclude', '**/*.integration.test.ts', ...sourceContractTests.flatMap(path => ['--exclude', path])]
    : ['--browser.headless'];
  return [['--filter', `@preflyt/${target}`, 'exec', 'vitest', 'run', ...options,
    ...(full ? [] : [`--changed=${scope.base}`, '--passWithNoTests'])]];
}

export function runFocused(target, scope, run = args => spawnSync('pnpm', args, { stdio: 'inherit' })) {
  for (const args of focusedCommands(target, scope)) {
    const result = run(args);
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (!['images', 'plan', 'api', 'web'].includes(mode)) throw new Error('Unknown change-scope operation');
  const scope = changedFiles(process.env);
  if (mode === 'images') {
    const required = imageRequired(process.env.GITHUB_REF_NAME, scope.paths);
    appendFileSync(process.env.GITHUB_OUTPUT, `publish=${required}\n`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, required
      ? 'Deployable inputs changed, history is new, or this is main: build and verify exact-commit images.\n'
      : 'No deployable inputs changed: development image builds and Compose qualification are skipped. No new commit image tags are created.\n');
  } else if (mode === 'plan') {
    const plan = testPlan(scope.paths);
    appendFileSync(process.env.GITHUB_OUTPUT, `api=${plan.api}\nweb=${plan.web}\n`);
  } else {
    process.exitCode = runFocused(mode, scope);
  }
}
