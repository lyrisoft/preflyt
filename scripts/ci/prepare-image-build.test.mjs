import {test} from 'node:test'
import assert from 'node:assert/strict'
import {prepareImageBuild,unusedToolchains,minimumImageBuildBytes} from './prepare-image-build.mjs'
const hosted={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',RUNNER_ARCH:'X64'}
test('only removes fixed unused SDKs on ephemeral hosted runners and enforces headroom',()=>{
 const calls=[],space=[14*1024**3,32*1024**3]
 assert.equal(prepareImageBuild(hosted,args=>calls.push(args),()=>space.shift(),()=>{}),32*1024**3)
 assert.deepEqual(calls,[['rm','-rf','--',...unusedToolchains]])
 assert.ok(unusedToolchains.every(path=>!path.includes('docker')&&!path.includes('hostedtoolcache')))
 assert.throws(()=>prepareImageBuild(hosted,()=>{},()=>minimumImageBuildBytes-1,()=>{}),/24 GiB/)
})
test('refuses local and self-hosted machines before deleting anything',()=>{
 for(const env of [{},{...hosted,GITHUB_ACTIONS:'false'},{...hosted,RUNNER_ENVIRONMENT:'self-hosted'},{...hosted,RUNNER_OS:'macOS'},{...hosted,RUNNER_ARCH:'ARM64'}])assert.throws(()=>prepareImageBuild(env,()=>assert.fail('must not delete'),()=>assert.fail('must not inspect disk')),/restricted/)
})
