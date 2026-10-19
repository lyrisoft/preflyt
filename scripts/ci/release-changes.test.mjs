import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseChangeFile, assembleChangeNotes, collectChangeNotes, prepareReleaseNotes, upgradeCategory } from './release-changes.mjs';
import { previewReleaseNotes } from './generate-release-notes.mjs';
import { planRelease } from './plan-release.mjs';
import { createRelease } from './create-release.mjs';
import { images } from './publish-release.mjs';

const version = 'v0.1.11';
const data = overrides => ({type:'improvement',title:'Saved findings',description:'Open saved findings without repeating the analysis.',upgrade:'none',...overrides});
const parse = (overrides = {}, file = '.changes/saved-findings.json') => parseChangeFile(JSON.stringify(data(overrides)), file);
const release = (tag, sha, overrides = {}) => ({tag_name:tag,draft:false,prerelease:false,body:`Reviewed changes.\n<!-- preflyt-release-ready:v1 sha=${sha} -->`,...overrides});
function repo(t) {
  const root = mkdtempSync(resolve(tmpdir(),'preflyt-release-changes-'));
  t.after(() => rmSync(root,{recursive:true,force:true}));
  const run = (command,args) => execFileSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  const git = (...args) => run('git',args);
  const write = (file,text) => { const path=resolve(root,file); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,text); };
  const change = (file,overrides = {}) => write(`.changes/${file}.json`,JSON.stringify(data(overrides)));
  const save = () => {
    git('add','.');
    git('-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Release fixture','-c','user.email=release-fixture@example.invalid','commit','-qm','Fixture change');
    return git('rev-parse','HEAD').trim();
  };
  git('init','-q');
  write('README.md','Release fixture');
  change('old',{title:'Already released'});
  const baseSha = save();
  return {root,run,git,write,change,save,baseSha};
}

test('change files identify the exact missing or invalid field', () => {
  assert.equal(parse().upgrade,'none');
  for (const [field,value] of [['type','unknown'],['title',''],['description',''],['upgrade',''],['description','TODO'],['migrations','migration.sql'],['configuration',['../.env']]]) {
    assert.throws(() => parse({[field]:value}), new RegExp(field));
  }
  assert.throws(() => parse({typo:'value'}),/unknown field typo/);
  assert.throws(() => parse({},'.changes/../outside.json'),/short-description/);
  assert.throws(() => parse({migrations:['a','a']}),/duplicate paths/);
  assert.throws(() => parse({migrations:['apps/api/prisma/migrations/new/migration.sql']}),/required upgrade action/);
  assert.throws(() => parseChangeFile('{invalid','.changes/invalid.json'),/invalid JSON/);
  assert.throws(() => parseChangeFile(' '.repeat(17000),'.changes/large.json'),/16 KiB/);
});

test('assembly groups changes deterministically and includes each upgrade explanation once', () => {
  const upgrade = 'Back up the database and run the migration service.';
  const changes = [parse({type:'fix',title:'Fixed lists',upgrade},'.changes/fix-lists.json'),parse({type:'feature',title:'Agent connections',upgrade},'.changes/agent-connections.json')];
  const notes = assembleChangeNotes(changes,[],version);
  assert.equal(notes,assembleChangeNotes([...changes].reverse(),[],version));
  assert.ok(notes.indexOf('Agent connections') < notes.indexOf('## Improvements and fixes'));
  assert.ok(notes.indexOf('Fixed lists') > notes.indexOf('## Improvements and fixes'));
  assert.equal(notes.split(upgrade).length-1,1);
  assert.ok(!notes.includes('sha=') && !notes.includes('## Technical details'));
  assert.match(assembleChangeNotes([parse()],[],version),/No new features/);
});

test('detected migrations and deployment settings require explicit file-linked upgrade explanations', () => {
  const migration = 'apps/api/prisma/migrations/20261019150000_example/migration.sql';
  const configuration = '.env.example';
  assert.throws(() => assembleChangeNotes([parse()],[migration,configuration],version),/Missing upgrade explanation for migrations/);
  const db = parse({upgrade:'Run the migration service before starting the API.',migrations:[migration]});
  assert.throws(() => assembleChangeNotes([db],[migration,configuration],version),/Missing upgrade explanation for configuration/);
  const settings = parse({upgrade:'Set the new setting on API and worker.',configuration:[configuration]},'.changes/new-setting.json');
  assert.match(assembleChangeNotes([db,settings],[migration,configuration],version),/Set the new setting/);
  assert.throws(() => assembleChangeNotes([db],[],version),/not changed in this release/);
  for (const path of ['.env.example','apps/api/.env.example','compose.local.yaml','docker-compose.yaml','deploy/kubernetes/resources.yaml','deploy/nginx.conf','apps/api/src/configuration/configuration-catalogue.ts']) assert.equal(upgradeCategory(path),'configuration',path);
  assert.equal(upgradeCategory(migration),'migrations');
  assert.equal(upgradeCategory('apps/api/src/service.ts'),null);
});

test('only newly introduced committed change files enter a release; worktree preview is explicit', t => {
  const f = repo(t);
  f.change('new-feature',{type:'feature',title:'New connections'});
  f.change('new-fix',{type:'fix',title:'Clearer validation'});
  const sha = f.save();
  const options = {version,sha,baseSha:f.baseSha,root:f.root};
  const prepared = collectChangeNotes(options,f.run);
  assert.deepEqual(prepared.files,['.changes/new-feature.json','.changes/new-fix.json']);
  assert.ok(!prepared.notes.includes('Already released'));
  f.change('new-feature',{type:'feature',title:'Changed draft title'});
  f.change('uncommitted',{type:'fix',title:'Draft fix'});
  assert.deepEqual(collectChangeNotes(options,f.run),prepared);
  const preview = collectChangeNotes({...options,worktree:true},f.run);
  assert.match(preview.notes,/Changed draft title/);
  assert.match(preview.notes,/Draft fix/);
  assert.deepEqual(previewReleaseNotes([`--base=${f.baseSha}`,`--version=${version}`,'--worktree'],f.run).notes,preview.notes);
  assert.throws(() => previewReleaseNotes([`--base=${f.baseSha}`,`--version=${version}`,'--unknown'],f.run),/Usage/);
  assert.equal(f.git('rev-parse','HEAD').trim(),sha);
});

test('previously released files cannot be edited or deleted and old entries are never reused', t => {
  const f = repo(t);
  const options = {version,sha:f.baseSha,baseSha:f.baseSha};
  assert.throws(() => collectChangeNotes(options,f.run),/No new change files/);
  f.change('old',{title:'Changed old entry'});
  let sha = f.save();
  assert.throws(() => collectChangeNotes({...options,sha},f.run),/immutable/);
  rmSync(resolve(f.root,'.changes/old.json'));
  sha=f.save();
  assert.throws(() => collectChangeNotes({...options,sha},f.run),/immutable/);
});

test('initial releases use committed change files and reject wrong checkout or unrelated history', t => {
  const f = repo(t);
  const result = collectChangeNotes({version,sha:f.baseSha},f.run);
  assert.match(result.notes,/Already released/);
  assert.throws(() => collectChangeNotes({version,sha:'a'.repeat(40)},f.run),/checkout differs/);
  assert.throws(() => collectChangeNotes({version,sha:f.baseSha,baseSha:'a'.repeat(40)},f.run),/Fetch full Git history/);
});

test('the baseline is the newest published image-ready release, excluding drafts and reserved tags', t => {
  const f = repo(t);
  f.change('new',{title:'New release change'});
  const sha = f.save();
  const tags = [{name:'v0.1.9',sha:f.baseSha},{name:'v0.1.10',sha:f.baseSha},{name:version,sha}];
  const releases = [release('v0.1.9',f.baseSha),release('v0.1.10',f.baseSha),release('v0.1.12',sha,{draft:true}),release('v0.1.13',sha,{prerelease:true})];
  const run = (command,args) => command==='gh' ? releases.map(JSON.stringify).join('\n') : f.run(command,args);
  const plan = prepareReleaseNotes({version,sha,repository:'lyrisoft/preflyt',tags},run);
  assert.equal(plan.previousVersion,'v0.1.10');
  assert.equal(plan.baseSha,f.baseSha);
  assert.equal(plan.digest.length,64);
  assert.deepEqual(plan,prepareReleaseNotes({version,sha,repository:'lyrisoft/preflyt',tags},run));
  assert.throws(() => prepareReleaseNotes({version,sha,repository:'lyrisoft/preflyt',tags:tags.filter(tag=>tag.name!=='v0.1.10')},run),/tag and image-readiness marker differ/);
});

test('published reruns preserve edited release bodies and do not require new fragments', () => {
  const sha='a'.repeat(40);
  const published = release(version,sha,{body:'Human-edited notes preserved.'});
  const context={version,sha,repository:'lyrisoft/preflyt',tags:[{name:version,sha}]};
  const run=(command) => { assert.equal(command,'gh'); return JSON.stringify(published); };
  const plan=prepareReleaseNotes(context,run);
  assert.equal(plan.existing,true);
  assert.equal(plan.notes,published.body);
  assert.throws(() => prepareReleaseNotes({...context,tags:[]},run),/tag differs/);
  assert.throws(() => prepareReleaseNotes(context,() => JSON.stringify({...published,draft:true})),/not a published stable release/);
  assert.throws(() => prepareReleaseNotes(context,() => JSON.stringify(release(version,'b'.repeat(40)))),/marker differs/);
});

test('missing baseline metadata or failed GitHub reads cannot become first-release permission', () => {
  const sha='a'.repeat(40),base='b'.repeat(40);
  const context={version,sha,repository:'lyrisoft/preflyt',tags:[{name:'v0.1.10',sha:base}]};
  assert.throws(() => prepareReleaseNotes(context,() => ''),/No published image-ready baseline/);
  assert.throws(() => prepareReleaseNotes(context,() => { throw new Error('HTTP 403'); }),/HTTP 403/);
});

test('manual planning previews generated notes and publication enforces the same digest without touching real registries', t => {
  const f=repo(t);
  f.change('new',{title:'Reviewed new change'});
  const sha=f.save();
  const tags=[{name:'v0.1.10',sha:f.baseSha}];
  const releases=[release('v0.1.10',f.baseSha)];
  const calls=[];
  const run=(command,args) => {
    calls.push([command,args]);
    if(command==='gh') {
      if(args[1].endsWith('/tags')) return tags.map(JSON.stringify).join('\n');
      if(args[1].endsWith('/releases')) return releases.map(JSON.stringify).join('\n');
    }
    return f.run(command,args);
  };
  const env={GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'lyrisoft/preflyt',GITHUB_REPOSITORY_OWNER:'lyrisoft',GITHUB_SHA:sha,GITHUB_OUTPUT:'output',GITHUB_STEP_SUMMARY:'summary'};
  const writes=[];
  assert.equal(planRelease(env,run,undefined,(...args)=>writes.push(args)),version);
  assert.match(writes[0][1],/^version=v0\.1\.11\nnotes_sha256=[a-f0-9]{64}\n$/);
  assert.match(writes[1][1],/Reviewed new change/);
  assert.ok(!writes[1][1].includes('preflyt-release-ready'));
  const expected=writes[0][1].match(/notes_sha256=([a-f0-9]+)/)[1];
  const plan=prepareReleaseNotes({version,sha,repository:env.GITHUB_REPOSITORY,tags},run);
  assert.equal(plan.digest,expected);
  assert.throws(() => createRelease({...env,PREFLYT_BUILD_VERSION:version,PREFLYT_RELEASE_NOTES_SHA256:'0'.repeat(64)},run),/Planned release notes changed/);
  assert.ok(!calls.some(([command])=>command==='docker'));
  assert.ok(!calls.some(([command,args])=>command==='gh'&&(args.includes('POST')||args[0]==='release')));
  // Exercise the real assembler and publisher together; only GitHub and registry
  // I/O are faked. No project repository commit or registry write is performed.
  const registry=new Map();
  const imageDigest=`sha256:${'c'.repeat(64)}`;
  for(const image of Object.keys(images)) registry.set(`ghcr.io/lyrisoft/${image}:sha-${sha}`,imageDigest);
  let published;
  const publishRun=(command,args) => {
    if(command==='docker') {
      if(args.includes('create')) { registry.set(args[args.indexOf('-t')+1],imageDigest); return ''; }
      const image=args.at(-1);
      if(!registry.has(image)) throw Object.assign(new Error('missing'),{stderr:'manifest unknown'});
      if(args.includes('--raw')) return JSON.stringify({manifests:['amd64','arm64'].map(architecture=>({platform:{os:'linux',architecture}}))});
      return registry.get(image);
    }
    if(command==='gh') {
      if(args[1]?.includes('/releases/tags/')) {
        if(published) return JSON.stringify(published);
        throw Object.assign(new Error('missing'),{stderr:'HTTP 404'});
      }
      if(args.includes('POST')) {
        tags.push({name:version,sha}); return '';
      }
      if(args[0]==='release'&&args[1]==='create') {
        published=release(version,sha,{body:args[args.indexOf('--notes')+1]});
        releases.push(published); return '';
      }
    }
    return run(command,args);
  };
  assert.equal(createRelease({...env,PREFLYT_BUILD_VERSION:version,PREFLYT_RELEASE_NOTES_SHA256:expected},publishRun),version);
  assert.match(published.body,/Reviewed new change/);
  assert.match(published.body,/compare\/v0\.1\.10\.\.\.v0\.1\.11/);
  assert.ok(published.body.includes(`<!-- preflyt-release-ready:v1 sha=${sha} -->`));
  assert.equal(published.body.match(/ghcr.io\/lyrisoft\/preflyt-/g).length,Object.keys(images).length);
  published.body='An authorized prose correction.\n'+published.body;
  const preserved=published.body;
  assert.equal(createRelease({...env,PREFLYT_BUILD_VERSION:version,PREFLYT_RELEASE_NOTES_SHA256:expected},publishRun),version);
  assert.equal(published.body,preserved);
});

test('repository change examples validate and the template remains unfinished', () => {
  const root=new URL('../../.changes/',import.meta.url);
  for(const file of readdirSync(root).filter(file=>file.endsWith('.json')&&file!=='TEMPLATE.json')) parseChangeFile(readFileSync(new URL(file,root),'utf8'),`.changes/${file}`);
  assert.throws(() => parseChangeFile(readFileSync(new URL('TEMPLATE.json',root),'utf8'),'.changes/example.json'),/placeholders/);
});
