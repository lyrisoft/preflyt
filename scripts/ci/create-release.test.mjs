import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelease, releaseVersion } from './create-release.mjs';
import { images } from './publish-release.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_SHA: sha, GITHUB_REPOSITORY_OWNER: 'lyrisoft', GITHUB_REPOSITORY: 'lyrisoft/preflyt', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push' };
const digest = `sha256:${'b'.repeat(64)}`;
function fixture(options = {}) {
  const calls = [], registry = new Map();
  for (const image of Object.keys(images)) registry.set(`ghcr.io/lyrisoft/${image}:sha-${sha}`, digest);
  if (options.conflict) registry.set('ghcr.io/lyrisoft/preflyt-web:v0.1.0', `sha256:${'c'.repeat(64)}`);
  const run = (command, args) => {
    calls.push([command, args]);
    if (command === 'gh') {
      if (args[1]?.endsWith('/tags')) return (options.tags ?? []).map(JSON.stringify).join('\n');
      if (args[1]?.includes('/releases/tags/')) {
        if (options.releaseError) throw Object.assign(new Error('auth'), { stderr: 'HTTP 403' });
        if (options.released) return '{"draft":false,"prerelease":false}';
        throw Object.assign(new Error('missing'), { stderr: 'HTTP 404' });
      }
      return '';
    }
    if (args.includes('create')) {
      registry.set(args[args.indexOf('-t') + 1], digest); return '';
    }
    const ref = args.at(-1);
    if (!registry.has(ref)) throw Object.assign(new Error('missing'), { stderr: options.registryError ? 'unauthorized' : 'manifest unknown' });
    if (args.includes('--raw')) return JSON.stringify({ manifests: (options.singleArch ? ['amd64'] : ['amd64', 'arm64']).map(architecture => ({ platform: { os: 'linux', architecture } })) });
    return registry.get(ref);
  };
  return { calls, run };
}
test('stable sequence ignores release candidates, sorts numerically and reuses commit version', () => {
  assert.equal(releaseVersion([{ name: 'v0.1.0-rc.2', sha: 'x' }], sha).version, 'v0.1.0');
  const tags = [{ name: 'v1.2.9', sha: 'x' }, { name: 'v1.2.10', sha: 'y' }];
  assert.equal(releaseVersion(tags, sha).version, 'v1.2.11');
  assert.deepEqual(releaseVersion([...tags, { name: 'v1.2.11', sha }], sha), { version: 'v1.2.11', reserved: true });
});
test('main reuses all dual architecture manifests and creates one exact-commit release', () => {
  const f = fixture(); assert.equal(createRelease(env, f.run), 'v0.1.0');
  const copies = f.calls.filter(([command, args]) => command === 'docker' && args.includes('create'));
  assert.equal(copies.length, Object.keys(images).length);
  assert.ok(copies.every(([, args]) => args.at(-1).endsWith(`@${digest}`)));
  assert.ok(!f.calls.some(([, args]) => args.includes('bake') || args.includes('build')));
  const reservation = f.calls.find(([, args]) => args.includes('ref=refs/tags/v0.1.0'));
  assert.ok(reservation[1].includes(`sha=${sha}`));
  assert.equal(f.calls.filter(([, args]) => args[0] === 'release' && args[1] === 'create').length, 1);
});
test('reruns reuse existing commit tag and published release', () => {
  const f = fixture({ tags: [{ name: 'v0.1.0', sha }], released: true });
  createRelease(env, f.run); const first = f.calls.length; createRelease(env, f.run);
  assert.ok(!f.calls.slice(first).some(([, args]) => args.includes('create') || args.includes('POST')));
});
test('development and PR events cannot create releases or touch registry', () => {
  for (const override of [{ GITHUB_REF: 'refs/heads/development' }, { GITHUB_EVENT_NAME: 'pull_request' }]) assert.throws(() => createRelease({ ...env, ...override }, () => assert.fail()), /push to main/);
});
test('incomplete architecture sources fail before reserving tag', () => {
  const f = fixture({ singleArch: true }); assert.throws(() => createRelease(env, f.run), /Missing release architecture/);
  assert.ok(!f.calls.some(([, args]) => args.includes('POST')));
});
test('existing version conflicts and registry authentication errors never overwrite', () => {
  for (const options of [{ conflict: true }, { registryError: true }]) {
    const f = fixture(options); assert.throws(() => createRelease(env, f.run), /overwrite|missing/);
    assert.ok(!f.calls.some(([, args]) => args[0] === 'release'));
  }
});
test('GitHub authorization failures never become permission to create a release', () => {
  const f = fixture({ releaseError: true }); assert.throws(() => createRelease(env, f.run), /auth/);
  assert.ok(!f.calls.some(([, args]) => args[0] === 'release'));
});
