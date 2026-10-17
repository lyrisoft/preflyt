import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishRelease, images } from './publish-release.mjs';
const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY_OWNER: 'lyrisoft', GITHUB_REPOSITORY: 'lyrisoft/preflyt', ARCH: 'arm64', BUILD_GROUP: 'api', RUNNER_TEMP: '/tmp' };
const missing = () => { throw Object.assign(new Error('missing'), { stderr: 'manifest unknown' }); };
test('API, migration, controller and Health scanner share the native build stage and architecture-separated cache', () => {
  let config; const calls = [];
  publishRelease('build', env, args => { calls.push(args); if (args.includes('inspect')) return missing(); return ''; }, (_, contents) => { config = JSON.parse(contents); });
  assert.equal(Object.keys(config.target).length, 4);
  assert.equal(config.target['preflyt-health-scanner'].target, 'health-scanner');
  assert.match(config.target['preflyt-health-scanner'].args.PREFLYT_DATABASE_EPOCH, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(config.target['preflyt-health-scanner']['cache-to'][0], /mode=min,/);
  assert.match(config.target['preflyt-api']['cache-to'][0], /mode=max,/);
  for (const target of Object.values(config.target)) {
    assert.equal(target.dockerfile, 'deploy/api.Dockerfile');
    assert.deepEqual(target.platforms, ['linux/arm64']);
    assert.deepEqual(target.attest, [{ type: 'sbom' }, { type: 'provenance', mode: 'max' }]);
    assert.match(target.tags[0], /-arm64$/);
    assert.match(target['cache-to'][0], /build-cache-arm64$/);
  }
  assert.equal(calls.filter(args => args.includes('bake')).length, 1);
  assert.ok(calls.at(-1).includes('--push'));
});
test('web builds independently and existing immutable architecture images are never rebuilt', () => {
  let config;
  publishRelease('build', { ...env, BUILD_GROUP: 'web', ARCH: 'amd64' }, args => args.includes('inspect') ? missing() : '', (_, contents) => { config = JSON.parse(contents); });
  assert.deepEqual(Object.keys(config.target), ['preflyt-web']);
  assert.deepEqual(config.target['preflyt-web'].attest, [{ type: 'sbom' }, { type: 'provenance', mode: 'max' }]);
  publishRelease('build', env, args => { assert.ok(args.includes('inspect')); return ''; }, () => assert.fail('should not rebuild existing images'));
});
test('registry permission failures stop the build without overwriting images', () => {
  assert.throws(() => publishRelease('build', env, () => { throw Object.assign(new Error('denied'), { stderr: 'unauthorized' }); }, () => assert.fail()), /denied/);
});
test('release manifests require both architectures and use both exact commit tags', () => {
  const calls = [];
  publishRelease('manifest', env, args => {
    calls.push(args);
    if (args.includes('--raw')) return JSON.stringify({ manifests: ['amd64', 'arm64'].map(architecture => ({ platform: { os: 'linux', architecture } })) });
    if (args.includes('inspect')) return missing();
    return '';
  });
  assert.equal(calls.filter(args => args.includes('create')).length, Object.keys(images).length);
  for (const args of calls.filter(args => args.includes('create'))) {
    assert.match(args.at(-2), /sha-a{40}-amd64$/);
    assert.match(args.at(-1), /sha-a{40}-arm64$/);
  }
  assert.throws(() => publishRelease('manifest', env, args => args.includes('--raw') ? '{"manifests":[]}' : ''), /Missing release architecture/);
});
test('invalid branch build configuration and release identity fail before Docker', () => {
  for (const overrides of [{ GITHUB_SHA: 'main' }, { ARCH: 'invalid' }, { BUILD_GROUP: 'unknown' }]) {
    assert.throws(() => publishRelease('build', { ...env, ...overrides }, () => assert.fail('must not call Docker')), /Invalid/);
  }
});

test('published images embed planned version and exact source commit',()=>{
 let config;
 publishRelease('build',{...env,PREFLYT_BUILD_VERSION:'v0.1.3'},args=>args.includes('inspect')?missing():'',(_,contents)=>{config=JSON.parse(contents)});
 for(const target of Object.values(config.target)){
  assert.equal(target.args.PREFLYT_BUILD_VERSION,'v0.1.3');assert.equal(target.args.PREFLYT_BUILD_SHA,env.GITHUB_SHA);
 }
});
