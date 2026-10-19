import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelease, releaseVersion } from './create-release.mjs';
import { images } from './publish-release.mjs';
import { planRelease } from './plan-release.mjs';
import { readReleaseNotes, renderReleaseNotes, validateReleaseNotes } from './release-notes.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { notesDigest } from './release-changes.mjs';
import { compareVersions, stableVersion } from './release-version.mjs';
const notes = "Understand the changes before upgrading.\n\n## What's new\n\n- Review findings in one place.\n\n## Improvements and fixes\n\n- Save findings summaries.\n\n## Upgrade notes\n\n- Back up and run the migration service.";
const loadNotes = ({version, sha, tags}) => {
  const previousVersion = tags.filter(tag => stableVersion.test(tag.name) && compareVersions(tag.name, version) < 0).sort((a,b) => compareVersions(b.name,a.name))[0]?.name;
  const plan = {version,sha,previousVersion,baseSha:null,files:[],notes};
  return {...plan,digest:notesDigest(plan)};
};
const sha = 'a'.repeat(40);
const env = { GITHUB_SHA: sha, GITHUB_REPOSITORY_OWNER: 'lyrisoft', GITHUB_REPOSITORY: 'lyrisoft/preflyt', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch' };
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
  const tags=options.tags ?? [];
  const plan=loadNotes({version:releaseVersion(tags,sha).version,sha,tags});
  return { calls, run, env:{...env,PREFLYT_RELEASE_NOTES_SHA256:plan.digest} };
}
test('stable sequence ignores release candidates, sorts numerically and reuses commit version', () => {
  assert.equal(releaseVersion([{ name: 'v0.1.0-rc.2', sha: 'x' }], sha).version, 'v0.1.0');
  const tags = [{ name: 'v1.2.9', sha: 'x' }, { name: 'v1.2.10', sha: 'y' }];
  assert.equal(releaseVersion(tags, sha).version, 'v1.2.11');
  assert.deepEqual(releaseVersion([...tags, { name: 'v1.2.11', sha }], sha), { version: 'v1.2.11', reserved: true });
});
test('main reuses all dual architecture manifests and creates one exact-commit release', () => {
  const f = fixture(); assert.equal(createRelease(f.env, f.run, loadNotes), 'v0.1.0');
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
  createRelease(f.env, f.run, loadNotes); const first = f.calls.length; createRelease(f.env, f.run, loadNotes);
  assert.ok(!f.calls.slice(first).some(([, args]) => args.includes('create') || args.includes('POST')));
});
test('development and PR events cannot create releases or touch registry', () => {
  for (const override of [{ GITHUB_REF: 'refs/heads/development' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'push' }]) assert.throws(() => createRelease({ ...env, ...override }, () => assert.fail()), /manual dispatch on main/);
});
test('incomplete architecture sources fail before reserving tag', () => {
  const f = fixture({ singleArch: true }); assert.throws(() => createRelease(f.env, f.run, loadNotes), /Missing release architecture/);
  assert.ok(!f.calls.some(([, args]) => args.includes('POST')));
});
test('existing version conflicts and registry authentication errors never overwrite', () => {
  for (const options of [{ conflict: true }, { registryError: true }]) {
    const f = fixture(options); assert.throws(() => createRelease(f.env, f.run, loadNotes), /overwrite|missing/);
    assert.ok(!f.calls.some(([, args]) => args[0] === 'release'));
  }
});
test('GitHub authorization failures never become permission to create a release', () => {
  const f = fixture({ releaseError: true }); assert.throws(() => createRelease(f.env, f.run, loadNotes), /auth/);
  assert.ok(!f.calls.some(([, args]) => args[0] === 'release'));
});

test('published notes qualify only the verified image commit and planned build version cannot drift', () => {
 const f=fixture();createRelease({...f.env,PREFLYT_BUILD_VERSION:'v0.1.0'},f.run,loadNotes);
 const release=f.calls.find(([command,args])=>command==='gh'&&args[0]==='release'&&args[1]==='create');
 assert.match(release[1][release[1].indexOf('--notes')+1],new RegExp(`preflyt-release-ready:v1 sha=${sha}`));
 const wrong=fixture();assert.throws(()=>createRelease({...wrong.env,PREFLYT_BUILD_VERSION:'v0.1.9'},wrong.run,loadNotes),/Planned build version changed/);
 assert.ok(!wrong.calls.some(([command])=>command==='docker'));
});

test('curated notes lead with user changes and retain verified build details and the exact previous version', () => {
  const f = fixture({ tags: [{name:'v0.1.8',sha:'x'}, {name:'v0.1.9',sha:'y'}, {name:'v0.1.11-rc.1',sha:'z'}] });
  const requested = [];
  assert.equal(createRelease(f.env, f.run, context => { requested.push(context.version); return loadNotes(context); }), 'v0.1.10');
  assert.deepEqual(requested, ['v0.1.10']);
  const args = f.calls.find(([command,args]) => command==='gh' && args[0]==='release' && args[1]==='create')[1];
  assert.ok(!args.includes('--generate-notes'));
  const body = args[args.indexOf('--notes')+1];
  assert.ok(body.startsWith(notes));
  assert.ok(body.indexOf('## Technical details') > body.indexOf('## Upgrade notes'));
  for (const image of Object.keys(images)) assert.ok(body.includes(`ghcr.io/lyrisoft/${image}:v0.1.10`));
  assert.ok(body.includes('linux/amd64') && body.includes('linux/arm64'));
  assert.match(body, /compare\/v0\.1\.9\.\.\.v0\.1\.10/);
  assert.equal(body.match(/preflyt-release-ready:v1/g).length, 1);
});

test('missing or unfinished notes stop both version planning and publication before side effects', () => {
  const missing = version => readReleaseNotes(version, () => { throw Object.assign(new Error('missing'), {code:'ENOENT'}); });
  for (const load of [missing, () => '', () => notes.replace('Save findings summaries.', 'TODO')]) {
    const f = fixture();
    const validate = context => ({...loadNotes(context),notes:validateReleaseNotes(load(context.version), context.version)});
    assert.throws(() => createRelease(env, f.run, validate), /Missing docs\/releases\/notes\/v0.1.0.md|must contain|placeholders/);
    assert.equal(f.calls.length, 1);
    const output = [];
    assert.throws(() => planRelease(env, f.run, validate, (...args) => output.push(args)), /Missing docs\/releases\/notes\/v0.1.0.md|must contain|placeholders/);
    assert.deepEqual(output, []);
    assert.ok(f.calls.every(([command, args]) => command === 'gh' && args[1].endsWith('/tags')));
  }
});

test('planning checks the exact selected version and writes its output only after validation', () => {
  const events = [];
  const f = fixture({tags:[{name:'v0.1.9',sha:'x'}]});
  const version = planRelease({...env,GITHUB_OUTPUT:'output'}, f.run, context => {
    events.push(['notes', context.version]); return loadNotes(context);
  }, (...args) => events.push(['output', ...args]));
  assert.equal(version, 'v0.1.10');
  const prepared = loadNotes({version,sha,tags:[{name:'v0.1.9',sha:'x'}]});
  assert.deepEqual(events, [['notes','v0.1.10'], ['output','output',`version=v0.1.10\nnotes_sha256=${prepared.digest}\n`]]);
  assert.throws(() => planRelease({...env,GITHUB_REF:'refs/heads/development'}, () => assert.fail()), /manual main/);
});

test('notes must match the pre-build plan before any image or tag mutation', () => {
  const plan = loadNotes({version:'v0.1.0',sha,tags:[]});
  const f = fixture();
  assert.equal(createRelease({...env,PREFLYT_RELEASE_NOTES_SHA256:plan.digest},f.run,loadNotes),'v0.1.0');
  const changed = fixture();
  assert.throws(() => createRelease({...env,PREFLYT_RELEASE_NOTES_SHA256:'0'.repeat(64)},changed.run,loadNotes), /Planned release notes changed/);
  assert.equal(changed.calls.length,1);
  const missing=fixture();
  assert.throws(() => createRelease(env,missing.run,loadNotes),/pre-build hash is missing/);
  assert.equal(missing.calls.length,1);
});

test('note files reject missing sections, empty sections, templates and forged publication metadata', () => {
  assert.equal(validateReleaseNotes(notes.replaceAll('\n', '\r\n'), 'v0.1.10'), notes);
  assert.throws(() => validateReleaseNotes(notes.replace('## Upgrade notes', '## Changes'), 'v0.1.10'), /must contain/);
  assert.throws(() => validateReleaseNotes(notes.replace('- Save findings summaries.', '<!-- write these -->'), 'v0.1.10'), /need content/);
  assert.throws(() => validateReleaseNotes(`${notes}\n<!-- preflyt-release-ready:v1 sha=${sha} -->`, 'v0.1.10'), /publisher/);
  assert.throws(() => readReleaseNotes('../../secrets'), /stable version/);
  const directory = new URL('../../docs/releases/notes/', import.meta.url);
  for (const file of readdirSync(directory).filter(file => /^v.*\.md$/.test(file))) {
    assert.ok(readReleaseNotes(file.slice(0, -3)).length);
  }
  assert.throws(() => validateReleaseNotes(readFileSync(new URL('TEMPLATE.md',directory),'utf8'),'v0.1.11'), /placeholders/);
});

test('first releases link to their source and do not invent a previous release', () => {
  const body = renderReleaseNotes({notes,version:'v0.1.0',sha,repository:'lyrisoft/preflyt'});
  assert.match(body, /tree\/v0\.1\.0/);
  assert.ok(!body.includes('/compare/'));
});
