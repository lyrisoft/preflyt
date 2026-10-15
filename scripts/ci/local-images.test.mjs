import {test} from 'node:test'
import assert from 'node:assert/strict'
import {localImageTargets,nativeImages,checkLocalImageSpace,minimumLocalImageBytes} from './local-images.mjs'
import {images} from './publish-release.mjs'
test('local qualification covers every application and native image on both release architectures',()=>{
 const tags=[]
 for(const architecture of ['amd64','arm64']){
  const api=localImageTargets(architecture,'api'),web=localImageTargets(architecture,'web'),native=localImageTargets(architecture,'native')
  assert.deepEqual(Object.keys({...api,...web}),Object.keys(images))
  assert.equal(Object.keys(native).length,6)
  assert.equal(native['preflyt-native-trivy-offline'].target,'dependencies')
  for(const definition of Object.values({...api,...web,...native})){
   assert.deepEqual(definition.platforms,['linux/'+architecture]);assert.deepEqual(definition.output,['type=docker'])
   assert.match(definition.tags[0],/^preflyt-local\//);assert.ok(!('cache-to' in definition));tags.push(...definition.tags)
  }
 }
 assert.equal(new Set(tags).size,22);assert.equal(Object.keys(nativeImages).length,6)
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
