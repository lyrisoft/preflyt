import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,statSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {localImageTargets,nativeImages,checkLocalImageSpace,minimumLocalImageBytes} from './local-images.mjs'
import {images,publishRelease} from './publish-release.mjs'
test('local qualification covers every application and native image on both release architectures',()=>{
 const tags=[]
 for(const architecture of ['amd64','arm64']){
  const api=localImageTargets(architecture,'api'),web=localImageTargets(architecture,'web'),strix=localImageTargets(architecture,'strix'),native=localImageTargets(architecture,'native')
  assert.deepEqual(Object.keys({...api,...strix,...web}),Object.keys(images))
  assert.equal(Object.keys(native).length,6)
  assert.equal(native['preflyt-native-trivy-offline'].target,'dependencies')
  for(const definition of Object.values(native))assert.equal(definition.context,'docs/deployment/native-runner')
  for(const definition of Object.values({...api,...web}))assert.equal(definition.context,'.')
  for(const definition of Object.values({...api,...strix,...web,...native})){
   assert.deepEqual(definition.platforms,['linux/'+architecture]);assert.deepEqual(definition.output,['type=docker'])
   assert.match(definition.tags[0],/^preflyt-local\//);assert.ok(!('cache-to' in definition));tags.push(...definition.tags)
  }
 }
 assert.equal(new Set(tags).size,26);assert.equal(Object.keys(nativeImages).length,6)
})
test('local qualification rejects unsupported architectures, groups and image names',()=>{
 for(const args of [['unknown','api'],['amd64','unknown'],['arm64','web','ghcr.io/remote']])assert.throws(()=>localImageTargets(...args),/Invalid/)
})
test('stops on Docker VM exhaustion even when the host still has free space',()=>{
 const enough=minimumLocalImageBytes+1
 assert.doesNotThrow(()=>checkLocalImageSpace(enough,enough))
 assert.throws(()=>checkLocalImageSpace(enough,minimumLocalImageBytes-1),/Docker filesystem/)
 assert.throws(()=>checkLocalImageSpace(minimumLocalImageBytes-1,enough),/Host filesystem/)
 assert.throws(()=>checkLocalImageSpace(enough,NaN),/Docker filesystem/)
})
test('local Strix qualification builds the controller and sandbox independently of API',()=>{
 const target=localImageTargets('arm64','strix');
 assert.deepEqual(Object.keys(target),['preflyt-strix-runner','preflyt-strix-sandbox']);
 assert.equal(target['preflyt-strix-runner'].dockerfile,'deploy/strix.Dockerfile');
 assert.equal(target['preflyt-strix-sandbox'].dockerfile,'sandbox.Dockerfile');
 assert.ok(!Object.keys(localImageTargets('arm64','api')).some(name=>name.startsWith('preflyt-strix-')));
});

for(const architecture of ['amd64','arm64'])test(`local and release Strix contexts resolve the sandbox COPY source (${architecture})`,()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const local=localImageTargets(architecture,'strix');
 let release;
 publishRelease('build',{
  GITHUB_SHA:'a'.repeat(40),GITHUB_REPOSITORY_OWNER:'lyrisoft',GITHUB_REPOSITORY:'lyrisoft/preflyt',
  ARCH:architecture,BUILD_GROUP:'strix',RUNNER_TEMP:'/tmp',
 },args=>{
  if(args.includes('inspect'))throw Object.assign(new Error('missing'),{stderr:'manifest unknown'});
  return '';
 },(_,contents)=>{release=JSON.parse(contents).target});
 for(const targets of [local,release]){
  assert.equal(targets['preflyt-strix-runner'].context,'.');
  assert.equal(targets['preflyt-strix-runner'].dockerfile,'deploy/strix.Dockerfile');
  const sandbox=targets['preflyt-strix-sandbox'];
  assert.equal(sandbox.context,'tools/strix-runner');
  assert.equal(sandbox.dockerfile,'sandbox.Dockerfile');
  const dockerfile=readFileSync(resolve(root,sandbox.context,sandbox.dockerfile),'utf8');
  const source=dockerfile.match(/^COPY (\S+) \/opt\/preflyt\/entrypoint\.sh$/m)?.[1];
  assert.equal(source,'sandbox-entrypoint.sh');
  assert.ok(statSync(resolve(root,sandbox.context,source)).isFile());
  const ignored=readFileSync(resolve(root,sandbox.context,`${sandbox.dockerfile}.dockerignore`),'utf8')
   .split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  assert.deepEqual(ignored,['**','!sandbox-entrypoint.sh']);
 }
});
