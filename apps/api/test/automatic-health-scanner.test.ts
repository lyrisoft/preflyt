import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { digest } from '../src/assessments/assessment-digest.js'
import { nativeAdapters, nativeToolReviews } from '../src/execution/native-plan.js'
import { gitObjectHash, verifyNativeSourceBundle } from '../src/execution/native-source.js'
import { readHealthScanSource } from '../src/health/health-scan-source.js'
import { admitHealthScan, healthDockerControls, healthScannerAuthority, healthScannerPlan, type HealthScannerPackage } from '../src/health/health-scanner-package.js'
import { healthScannerServer } from '../src/health/health-scanner-server.js'
import { signNativeReceipt, verifyNativeReceipt, type NativeReceipt } from '../src/execution/native-receipt.js'

const pair=generateKeyPairSync('ed25519'), publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString(), privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()
const info={OSType:'linux',ID:'fixture-engine',ServerVersion:'29.8.2',KernelVersion:'fixture',Runtimes:{runc:{}},SecurityOptions:['name=seccomp,profile=builtin'],MemoryLimit:true,PidsLimit:true}
const pkg=():HealthScannerPackage=>({version:1,environmentId:'health-fixture',runtime:'runc',controlsHash:healthDockerControls(info,'runc'),controllerPublicKey:publicKey,createdAt:new Date(Date.now()-60000).toISOString(),tools:[{ruleId:'secrets.scan',image:'sha256:'+'b'.repeat(64),toolVersion:'8.30.0',license:'MIT',configHash:'c'.repeat(64),reviewDigest:'d'.repeat(64),expiresAt:'2099-01-01T00:00:00Z',databaseBuiltAt:null}]})
const expected=(value=pkg())=>{
 const id=randomUUID(), {planHash,...plan}=healthScannerPlan(value,{organizationId:'org',repositoryId:'51',sourceSha:'a'.repeat(40),selectionId:'health:'+id,ruleIds:['secrets.scan']})
 return {requestId:id,attemptId:id,organizationId:'org',repositoryId:'51',sourceSha:'a'.repeat(40),sourceHash:'e'.repeat(64),selectionId:'health:'+id,planHash,plan,ruleIds:['secrets.scan'],approvalHash:healthScannerAuthority(value,'org').reviewed.approvalHash}
}
afterEach(()=>vi.unstubAllEnvs())

it('admits a fixed Health scanner without external runtime approvals or selected standards',()=>{
 vi.stubEnv('NATIVE_RUNTIME_APPROVAL','');vi.stubEnv('NATIVE_DOCKER_APPROVAL','');vi.stubEnv('NATIVE_RUNTIME_REVIEW_KEYS','[]');vi.stubEnv('NATIVE_TOOL_REVIEWS','[]')
 const value=pkg(), input=expected(value)
 expect(admitHealthScan(value,input).rules).toEqual(['secrets.scan'])
 expect(nativeToolReviews(JSON.stringify(value.tools))).toBeNull()
 expect(healthScannerAuthority(value,'other').reviewed.approvalHash).not.toBe(input.approvalHash)
})
it('rejects repository commands, testing adapters, mutable image tags and changed plans',()=>{
 const value=pkg(),input=expected(value)
 for(const ruleId of ['tests.required','tests.coverage','lint.required','repo.supplied-command'])
  expect(()=>healthScannerPlan(value,{...input,ruleIds:[ruleId]})).toThrow()
 expect(()=>healthScannerAuthority({...value,tools:[{...value.tools[0],image:'scanner:latest'}]},'org')).toThrow()
 expect(()=>admitHealthScan(value,{...input,plan:{...input.plan,steps:[{...input.plan.steps[0],args:['--config','/workspace/malicious.yaml']}]}})).toThrow()
 expect(()=>admitHealthScan(value,{...input,organizationId:'other'})).toThrow()
 expect(()=>admitHealthScan(value,{...input,selectionId:'policy-selection'})).toThrow()
})
it('requires Linux, seccomp and effective memory/PID isolation rather than the presence of Docker',()=>{
 for(const patch of [{OSType:'windows'},{SecurityOptions:[]},{MemoryLimit:false},{PidsLimit:false},{Runtimes:{}}])
  expect(()=>healthDockerControls({...info,...patch},'runc')).toThrow()
 expect(healthDockerControls({...info,KernelVersion:'changed'},'runc')).not.toBe(pkg().controlsHash)
})
it('verifies signed scanner results independently of manual approvals and rejects wrong commit, replay scope and forged signatures',()=>{
 const value=pkg(),input=expected(value),authority=healthScannerAuthority(value,'org')
 const {plan,ruleIds,...scope}=input
 const receipt:NativeReceipt={...scope,version:1,environmentId:value.environmentId,controlsHash:value.controlsHash,toolReviewHash:authority.tools.reviewHash,startedAt:new Date(Date.now()-1000).toISOString(),finishedAt:new Date().toISOString(),cancelled:false,checks:[{
  ruleId:'secrets.scan',state:'PASS',reason:'CHECKS_PASSED',reportHash:'f'.repeat(64),summary:{runs:1,results:0,suppressed:0},adapterId:nativeAdapters['secrets.scan'].id,image:value.tools[0].image,toolVersion:value.tools[0].toolVersion,configHash:value.tools[0].configHash,commandHash:digest(nativeAdapters['secrets.scan']),exitCode:0,cleanupConfirmed:true,coverage:'FULL_RULE',findings:[],
 }]}
 const token=signNativeReceipt(receipt,privateKey,publicKey)
 expect(verifyNativeReceipt(token,input,Date.now(),authority)?.checks[0].state).toBe('PASS')
 expect(verifyNativeReceipt(token,{...input,sourceSha:'b'.repeat(40)},Date.now(),authority)).toBeNull()
 expect(verifyNativeReceipt(token,{...input,requestId:randomUUID()},Date.now(),authority)).toBeNull()
 expect(verifyNativeReceipt(token.slice(0,-8)+'forgedxx',input,Date.now(),authority)).toBeNull()
})

const sourceFixture=()=>{
 const code=Buffer.from('eval(input)\n'),image=Buffer.from('image'),link=Buffer.from('../private')
 const entries=[{path:'app.ts',type:'blob',mode:'100644',sha:gitObjectHash('blob',code),size:code.length},{path:'asset.png',type:'blob',mode:'100644',sha:gitObjectHash('blob',image),size:image.length},{path:'link',type:'blob',mode:'120000',sha:gitObjectHash('blob',link),size:link.length}]
 const root=gitObjectHash('tree',Buffer.concat(entries.map(entry=>Buffer.concat([Buffer.from(entry.mode.replace(/^0+/,'')+' '+entry.path+'\0'),Buffer.from(entry.sha,'hex')]))))
 const request=vi.fn(async(path:string)=>path.includes('/commits/')?{sha:'a'.repeat(40),tree:{sha:root}}:path.includes('/trees/')?{sha:root,truncated:false,tree:entries}:{sha:entries[0].sha,size:code.length,encoding:'base64',content:code.toString('base64')})
 return {request,entries,root}
}
it('verifies the original commit tree, excludes binaries and links explicitly, and exports a safe verified scanner workspace',async()=>{
 const fixture=sourceFixture(),result=await readHealthScanSource(fixture.request as any,'/repos/fixture/repo','51','a'.repeat(40))
 expect(result.excludedFiles).toBe(2);expect(result.originalTreeSha).toBe(fixture.root)
 expect(verifyNativeSourceBundle(result.source).files.map(file=>file.path)).toEqual(['app.ts'])
 expect(fixture.request.mock.calls.filter(([path])=>path.includes('/blobs/'))).toHaveLength(1)
})
it('rejects corrupt trees and never fetches source after cancellation',async()=>{
 const fixture=sourceFixture(),request=vi.fn(async(path:string)=>path.includes('/commits/')?{sha:'a'.repeat(40),tree:{sha:fixture.root}}:{sha:fixture.root,truncated:false,tree:[{...fixture.entries[0],sha:'f'.repeat(40)},...fixture.entries.slice(1)]})
 await expect(readHealthScanSource(request as any,'/repos/fixture/repo','51','a'.repeat(40))).rejects.toThrow('Git tree contents changed')
 const signal=new AbortController();signal.abort()
 const aborted=sourceFixture()
 await expect(readHealthScanSource(aborted.request as any,'/repos/fixture/repo','51','a'.repeat(40),signal.signal)).rejects.toThrow()
 expect(aborted.request.mock.calls.some(([path])=>path.includes('/blobs/'))).toBe(false)
})
it('authenticates the dedicated scanner service and refuses command-execution requests',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'preflyt-health-controller-')), value=pkg(), key='x'.repeat(64)
 const controller=await healthScannerServer(value,key,join(directory,'jobs'),async()=>Buffer.from(JSON.stringify(info)))
 try{
  await new Promise<void>(ready=>controller.server.listen(0,'127.0.0.1',ready));const origin='http://127.0.0.1:'+(controller.server.address() as any).port
  expect((await fetch(origin+'/package')).status).toBe(401)
  expect((await fetch(origin+'/package',{headers:{Authorization:'Bearer '+key}})).status).toBe(200)
  const input=expected(value)
  const response=await fetch(origin+'/jobs/admit',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expected:{...input,ruleIds:['tests.required']},source:{}})})
  expect(response.status).toBe(409)
 }finally{await controller.close();await rm(directory,{recursive:true,force:true})}
})
it('normalizes only image-owned workspace locations and removes source snippets',async()=>{
 const {normalizeSemgrepLocations}=await import('../../../docs/deployment/native-runner/semgrep-locations.mjs')
 const location=(uri:string)=>({physicalLocation:{artifactLocation:{uri,uriBaseId:'%SRCROOT%'},region:{startLine:2,endLine:2,snippet:{text:'private source'}}}})
 const report=normalizeSemgrepLocations({runs:[{results:[{locations:[location('/workspace/src/app.ts')]}]}]})
 expect(report.runs[0].results[0].locations[0].physicalLocation).toEqual({artifactLocation:{uri:'src/app.ts'},region:{startLine:2,endLine:2}})
 for(const uri of ['/other/repo/app.ts','/workspace/../secret','file:///workspace/src/app.ts','/workspace/%2e%2e/secret'])
  expect(()=>normalizeSemgrepLocations({runs:[{results:[{locations:[location(uri)]}]}]})).toThrow()
})

it('verifies batched source bytes rather than trusting a provider text response', async () => {
 const fixture=sourceFixture(), code=Buffer.from('eval(input)\n')
 const good=vi.fn(async()=>new Map([[fixture.entries[0].sha,{sha:fixture.entries[0].sha,size:code.length,encoding:'base64',content:code.toString('base64')}]]))
 const result=await readHealthScanSource(fixture.request as any,'/repos/fixture/repo','51','a'.repeat(40),undefined,good)
 expect(result.source.files).toHaveLength(1)
 expect(fixture.request.mock.calls.some(([path])=>path.includes('/blobs/'))).toBe(false)
 const changed=vi.fn(async()=>new Map([[fixture.entries[0].sha,{sha:fixture.entries[0].sha,size:code.length,encoding:'base64',content:Buffer.from('other(input)').toString('base64')}]]))
 await expect(readHealthScanSource(fixture.request as any,'/repos/fixture/repo','51','a'.repeat(40),undefined,changed)).rejects.toThrow()
})

it('rejects unprotected connection files and plaintext scanner endpoints',async()=>{
 const {HealthScannerClient}=await import('../src/health/health-scanner-client.js')
 const {writeFile,chmod}=await import('node:fs/promises')
 const directory=await mkdtemp(join(tmpdir(),'preflyt-health-client-')), file=join(directory,'connection.json')
 vi.stubEnv('HEALTH_SCANNER_CONNECTION_FILE',file)
 try{
  await writeFile(file,JSON.stringify({origin:'http://127.0.0.1:3011',apiKey:'x'.repeat(64),publicKey,ca:'-----BEGIN CERTIFICATE-----fixture'}),{mode:0o600})
  await expect(new HealthScannerClient().package('org')).rejects.toThrow('Invalid scanner connection')
  await chmod(file,0o644)
  await expect(new HealthScannerClient().package('org')).rejects.toThrow('Scanner connection is not protected')
 }finally{await rm(directory,{recursive:true,force:true})}
})
