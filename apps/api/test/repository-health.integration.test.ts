import { HealthGitSourceError } from '../src/health/health-git-source.js'
import { GitHubRateLimitError } from '../src/github/github-rate-limit.js'
import { FindingSourceStore } from '../src/findings/finding-source-store.service.js'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard } from '../src/auth/session.guard.js'
import { RepositoryHealthController } from '../src/health/repository-health.controller.js'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest'
import { disposableDatabase } from './disposable-database.js'
import { RepositoryHealthService } from '../src/health/repository-health.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { NativeResultService } from '../src/execution/native-result.service.js'
import { nativeSelectionCurrent } from '../src/execution/native-selection-current.js'
import { nativeEvidenceExpected } from '../src/execution/native-evidence.js'
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
import { nativeToolReviews, nativeAdapters } from '../src/execution/native-plan.js'
import { signNativeReceipt, verifyNativeReceipt } from '../src/execution/native-receipt.js'
import { digest } from '../src/assessments/assessment-digest.js'
import { HealthScannerClient } from '../src/health/health-scanner-client.js'
import { healthScannerAuthority } from '../src/health/health-scanner-package.js'
import type { AuthenticatedSession } from '../src/auth/session.guard.js'
vi.mock('../src/execution/native-runtime.js',()=>({nativeRuntimeApproval:vi.fn()}))
let app: INestApplication
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, service: RepositoryHealthService, owner: AuthenticatedSession, developer: AuthenticatedSession, outsider: AuthenticatedSession, repoId: string
const provider={readRepositorySnapshot:vi.fn(),verifyReadinessBranch:vi.fn(),readHealthSource:vi.fn(),readHealthScanSource:vi.fn()}, runtime={status:vi.fn()}
const sha='a'.repeat(40)
beforeAll(async()=>{
 fixture=await disposableDatabase('health')
 app=await NestFactory.create({module:class TestHealthModule{},controllers:[RepositoryHealthController],providers:[
  SessionGuard,{provide:AuthorizationService,useValue:new AuthorizationService(fixture.prisma)},
  {provide:RepositoryHealthService,useFactory:()=>({saveTestSettings:(...args:any[])=>service.saveTestSettings(...args as [any,any,any]),hotspotReview:(...args:any[])=>service.hotspotReview(...args as [any,any,any,any]),saveHotspotReview:(...args:any[])=>service.saveHotspotReview(...args as [any,any,any,any,any]),get:(...args:any[])=>service.get(...args as [any,any,any,any]),freshness:(...args:any[])=>service.freshness(...args as [any,any,any]),start:(...args:any[])=>service.start(...args as [any,any,any]),cancel:(...args:any[])=>service.cancel(...args as [any,any,any]),source:(...args:any[])=>service.source(...args as [any,any,any,any]),portfolio:(...args:any[])=>service.portfolio(...args as [any,any,any,any,any])})},
  {provide:AuthService,useValue:{sessionCookieName:'health.sid',currentSession:async(token:string)=>({owner,developer,outsider} as any)[token]??{authenticated:false},assertOrigin:(origin:string)=>{if(origin!=='http://localhost:5173')throw new ForbiddenException()}}}
 ]},{logger:false})
 app.use(cookieParser());await app.init()
})
afterAll(async()=>{await app?.close();await fixture?.close()})
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
beforeEach(async()=>{
 await fixture.reset();const db=fixture.prisma,org=(await db.organization.create({data:{name:'health'}})).id
 const actor=async(subject:string,role:'OWNER'|'DEVELOPER',organizationId=org)=>{
  const identity=await db.identity.create({data:{issuer:'fixture',subject}});await db.organizationMembership.create({data:{identityId:identity.id,organizationId,role}})
  return {authenticated:true as const,identityId:identity.id,organizationId,subject,email:null,role}
 }
 owner=await actor('owner','OWNER');developer=await actor('dev','DEVELOPER');outsider=await actor('other','OWNER',(await db.organization.create({data:{name:'other'}})).id)
 await db.gitHubInstallation.create({data:{id:50n,connectedById:owner.identityId,organizationId:org,accountLogin:'fixture',accountType:'Organization',repositorySelection:'selected',permissions:{}}})
 const repo=await db.gitHubRepository.create({data:{githubId:51n,installationId:50n,name:'repo',fullName:'fixture/repo',ownerLogin:'fixture',isPrivate:true,selected:true,defaultBranch:'development'}});repoId=repo.id
 const m=await db.organizationMembership.findFirstOrThrow({where:{identityId:developer.identityId}});await db.repositoryGrant.create({data:{repositoryId:repo.id,membershipId:m.id}})
 provider.readRepositorySnapshot.mockResolvedValue({sourceSha:sha,treeSha:'b'.repeat(40),branch:'development',fullName:'fixture/repo',complete:true,warnings:[],files:[{path:'app.ts',sha:'c'.repeat(40),size:20}]})
 provider.verifyReadinessBranch.mockResolvedValue(sha);runtime.status.mockResolvedValue({executionAvailable:false,reason:'REVIEW_REQUIRED'})
 vi.stubEnv('NOTIFICATIONS_ENABLED','true');vi.stubEnv('NATIVE_TOOL_REVIEWS','[]')
 service=new RepositoryHealthService(db,new AuthorizationService(db),provider as any,runtime as any,new FindingSourceStore(db,provider as any))
})
it('selection queues once without needing CI, standards or an immediate source read, then saves a partial report and one outbox event',async()=>{
 const rows=await Promise.all([service.initial(owner.identityId,'51'),service.initial(owner.identityId,'51')]);expect(rows[0].id).toBe(rows[1].id);expect(provider.readRepositorySnapshot).not.toHaveBeenCalled()
 await service.process(rows[0].id);await service.process(rows[0].id)
 const report=await service.get(owner,'51');expect(report.assessment).toMatchObject({state:'COMPLETED',sourceSha:sha,report:{mode:'INSPECTION_ONLY',completeness:'PARTIAL'}})
 expect(await fixture.prisma.notificationEvent.count()).toBe(1);expect(await fixture.prisma.repositoryStandardsSelection.count()).toBe(0);expect(await fixture.prisma.gatePolicyRevision.count()).toBe(0);expect(await fixture.prisma.commitAssessment.count()).toBe(0)
})
it('automatically scans the selected repository without standards, CI or manual runtime approval and stores verified findings',async()=>{
 const key=generateKeyPairSync('ed25519'),publicKey=key.publicKey.export({type:'spki',format:'pem'}).toString(),privateKey=key.privateKey.export({type:'pkcs8',format:'pem'}).toString()
 const ids=['secrets.scan','security.sast','quality.reliability','quality.maintainability','quality.duplication','security.hotspots','tests.coverage'] as const
 const pkg={version:1 as const,environmentId:'health-fixture',runtime:'runc' as const,controlsHash:'d'.repeat(64),controllerPublicKey:publicKey,createdAt:new Date(Date.now()-60000).toISOString(),tools:ids.map(ruleId=>({ruleId,image:'sha256:'+'b'.repeat(64),toolVersion:'fixture-1',license:nativeAdapters[ruleId].license,configHash:'c'.repeat(64),reviewDigest:'d'.repeat(64),expiresAt:'2099-01-01T00:00:00Z',databaseBuiltAt:null}))}
 let admitted=false
 const scanner={package:vi.fn(async()=>pkg),verify:new HealthScannerClient().verify,call:vi.fn(async(action:string,input:any)=>{
  if(action==='status'&&!admitted)return {state:'NOT_FOUND'}
  if(action==='admit'){admitted=true;return {state:'PREPARING'}}
  const {plan,ruleIds,...scope}=input,authority=healthScannerAuthority(pkg,owner.organizationId!)
  const receipt:any={...scope,version:1,environmentId:pkg.environmentId,controlsHash:pkg.controlsHash,toolReviewHash:authority.tools.reviewHash,startedAt:new Date(Date.now()-1000).toISOString(),finishedAt:new Date().toISOString(),cancelled:false,checks:ruleIds.map((ruleId:any)=>{
   const tool=pkg.tools.find(tool=>tool.ruleId===ruleId)!,adapter=nativeAdapters[ruleId as keyof typeof nativeAdapters]
   return {ruleId,state:'INCOMPLETE',reason:'SCAN_ERRORS',reportHash:null,summary:null,adapterId:adapter.id,image:tool.image,toolVersion:tool.toolVersion,configHash:tool.configHash,commandHash:digest(adapter),exitCode:null,cleanupConfirmed:true,coverage:'PARTIAL',findings:[]}
  })}
  const sast=receipt.checks.find((check:any)=>check.ruleId==='security.sast')
  Object.assign(sast,{state:'FAIL',reason:'FINDINGS_REPORTED',reportHash:'f'.repeat(64),summary:{runs:1,results:1,suppressed:0},exitCode:1,fileAnalysis:{version:1,formula:'semgrep-candidate-files-v1',scope:'js-ts-python',candidateFiles:1,analyzedFiles:1,skippedFiles:0,pathsDigest:'e'.repeat(64)},findings:[{category:'security',fingerprint:'f'.repeat(64),severity:'high',title:'Dynamic code execution requires review',ruleId:'preflyt-js-eval',path:'app.ts',line:1,endLine:1,suppressed:false}]})
  return {state:'COMPLETE',signature:signNativeReceipt(receipt,privateKey,publicKey),cleanupConfirmed:true}
 })}
 provider.readHealthScanSource.mockResolvedValue({source:{sourceHash:'e'.repeat(64)},excludedFiles:0,originalTreeSha:'b'.repeat(40)})
 runtime.status.mockClear()
 service=new RepositoryHealthService(fixture.prisma,new AuthorizationService(fixture.prisma),provider as any,runtime as any,new FindingSourceStore(fixture.prisma,provider as any),scanner as any)
 const scan=await service.initial(owner.identityId,'51')
 await service.process(scan.id)
 expect(scanner.call).toHaveBeenCalledWith('admit',expect.objectContaining({repositoryId:'51',sourceSha:sha,selectionId:'health:'+scan.id}),expect.anything())
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:scan.id},data:{leaseUntil:null}})
 await service.process(scan.id)
 const result=await service.get(owner,'51')
 expect(result.assessment).toMatchObject({state:'COMPLETED',report:{mode:'EXECUTED',findings:[expect.objectContaining({severity:'high',path:'app.ts',line:1})]}})
 admitted=false
 scanner.call.mockClear()
 const security=await service.start(owner,'51',{requestKey:randomUUID(),category:'security'})
 await service.process(security.id)
 expect(scanner.call).toHaveBeenCalledWith('admit',expect.objectContaining({ruleIds:['secrets.scan','security.sast','security.hotspots']}),expect.anything())
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:security.id},data:{leaseUntil:null}})
 await service.process(security.id)
 expect((await service.get(owner,'51')).assessment).toMatchObject({id:security.id,category:'security',report:{selection:'security',completeness:'PARTIAL'}})
 expect(runtime.status).not.toHaveBeenCalled()
 expect(await fixture.prisma.nativeExecutionRequest.count()).toBe(0)
 expect(await fixture.prisma.repositoryStandardsSelection.count()).toBe(0)
 expect(await fixture.prisma.commitAssessment.count()).toBe(0)
 await expect(service.get(outsider,'51')).rejects.toThrow()
})
it('enforces organization scope, separate execution permission, invalid branch and reassessment limits',async()=>{
 await expect(service.initial(outsider.identityId,'51')).rejects.toThrow();await expect(service.start(developer,'51',{requestKey:randomUUID()})).rejects.toThrow();await expect(service.start(owner,'51',{branch:'refs/main',requestKey:randomUUID()})).rejects.toThrow()
 expect((await service.portfolio(outsider)).items).toHaveLength(0)
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 await expect(service.start(owner,'51',{requestKey:randomUUID()})).rejects.toThrow('Wait a minute');expect((await service.get(developer,'51')).assessment?.id).toBe(row.id)
})
it('changing branches preserves reports and branch advancement marks the pinned report stale',async()=>{
 const first=await service.initial(owner.identityId,'51');await service.process(first.id)
 provider.readRepositorySnapshot.mockResolvedValueOnce({sourceSha:'d'.repeat(40),treeSha:'b'.repeat(40),branch:'release',fullName:'fixture/repo',complete:true,warnings:[],files:[]})
 const second=await service.start(owner,'51',{branch:'release',requestKey:randomUUID()});await service.process(second.id)
 expect((await service.get(owner,'51',first.id)).assessment?.branch).toBe('development');expect((await service.get(owner,'51')).assessment?.branch).toBe('release')
 await fixture.prisma.repositoryHealthTarget.update({where:{repositoryId:repoId},data:{headCheckedAt:new Date(0)}});provider.verifyReadinessBranch.mockResolvedValue('e'.repeat(40))
 expect((await service.get(owner,'51')).freshness).toBe('UNVERIFIED');expect((await service.freshness(owner,'51',second.id)).freshness).toBe('STALE');expect((await service.get(owner,'51')).freshness).toBe('STALE');expect((await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}})).sourceSha).toBe(sha)
})
it('cancels queued jobs, records source failures and denies retrieval after selection is revoked',async()=>{
 const row=await service.initial(owner.identityId,'51');await service.cancel(owner,'51',row.id);await service.process(row.id);expect((await service.get(owner,'51')).assessment?.state).toBe('CANCELLED');expect(provider.readRepositorySnapshot).not.toHaveBeenCalled()
 await fixture.prisma.repositoryHealthAssessment.deleteMany();provider.readRepositorySnapshot.mockRejectedValue(new Error('credential must not appear'))
 const next=await service.initial(owner.identityId,'51');await service.process(next.id);expect((await service.get(owner,'51')).assessment).toMatchObject({state:'FAILED',reason:'SOURCE_OR_ANALYSIS_UNAVAILABLE'})
 await fixture.prisma.gitHubRepository.update({where:{id:repoId},data:{selected:false}});await expect(service.get(owner,'51')).rejects.toThrow()
})
it.each(['secrets.scan','quality.reliability','quality.maintainability','quality.duplication','security.hotspots'] as const)('queues %s without standards and accepts only correctly categorized signed findings without CI gate evidence',async(ruleId)=>{
 const category=ruleId==='quality.reliability'?'reliability':ruleId==='quality.maintainability'?'maintainability':ruleId==='quality.duplication'?'duplication':ruleId==='security.hotspots'?'hotspot':'security'
 const db=fixture.prisma,pair=generateKeyPairSync('ed25519'), pub=pair.publicKey.export({type:'spki',format:'pem'}).toString(), key=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()
 vi.stubEnv('NATIVE_TOOL_REVIEWS',JSON.stringify([{ruleId,image:'registry.example/scanner@sha256:'+'a'.repeat(64),toolVersion:'8.28.0',license:nativeAdapters[ruleId].license,configHash:'b'.repeat(64),reviewDigest:'c'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString(),databaseBuiltAt:null}]))
 const tools=nativeToolReviews()!,approvalHash='d'.repeat(64),approval:any={controllerPublicKey:pub,organizationIds:[owner.organizationId],environmentId:'reviewed',controlsHash:'e'.repeat(64),approvedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),toolReviewHash:tools.reviewHash}
 vi.mocked(nativeRuntimeApproval).mockReturnValue({backend:'docker',approval,approvalHash} as any);runtime.status.mockResolvedValue({executionAvailable:true,reason:'READY'})
 const first=await service.initial(owner.identityId,'51');await service.process(first.id)
 const health=await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}});expect(health.state).toBe('RUNNING')
 let native=await db.nativeExecutionRequest.findUniqueOrThrow({where:{id:health.nativeRequestId!}});expect(await nativeSelectionCurrent(db,native)).toBe(true)
 native=await db.nativeExecutionRequest.update({where:{id:native.id},data:{state:'RUNNING',controllerJobId:randomUUID(),sourceHash:'f'.repeat(64),runtimeApprovalHash:approvalHash,environmentId:'reviewed',leaseUntil:new Date(Date.now()+60000)}})
 const expected=nativeEvidenceExpected(native)!, f={fingerprint:'9'.repeat(64),category,severity:'high',title:'Potential secret detected; sensitive details hidden',path:'app.ts',line:1,ruleId:'fixture-secret',suppressed:false}
 const receipt:any={version:1,...Object.fromEntries(['requestId','attemptId','organizationId','repositoryId','sourceSha','sourceHash','selectionId','planHash'].map(k=>[k,(expected as any)[k]])),approvalHash,environmentId:'reviewed',controlsHash:approval.controlsHash,toolReviewHash:tools.reviewHash,startedAt:new Date(Date.now()-1000).toISOString(),finishedAt:new Date().toISOString(),cancelled:false,
 checks:[{ruleId,state:'FAIL',reason:'FINDINGS_REPORTED',reportHash:'1'.repeat(64),summary:{runs:1,results:1,suppressed:0},adapterId:nativeAdapters[ruleId].id,image:tools.reviews[0].image,toolVersion:tools.reviews[0].toolVersion,configHash:tools.reviews[0].configHash,commandHash:digest(nativeAdapters[ruleId]),exitCode:1,cleanupConfirmed:true,coverage:'FULL_RULE',findings:[f],...(ruleId==='quality.duplication'?{measurement:{version:1,kind:'duplication',formula:'unique-lines-v1',analyzedLines:100,duplicatedLines:20,analyzedFiles:2,clonePairs:1,minimumLines:5,minimumTokens:50,mode:'weak'}}:{})}]}
 expect(verifyNativeReceipt(signNativeReceipt({...receipt,checks:[{...receipt.checks[0],findings:[{...f,category:category==='security'?'reliability':'security'}]}]},key,pub),expected)).toBeNull()
 const sink=new NativeResultService(db,new AuthorizationService(db),{createNative:vi.fn()} as any)
 await sink.complete(native.id,signNativeReceipt(receipt,key,pub));await db.repositoryHealthAssessment.update({where:{id:first.id},data:{leaseUntil:null}});await service.process(first.id)
 const report=(await service.get(owner,'51')).assessment!;expect(report.report?.findings[0]).toMatchObject({path:'app.ts',line:1,category});expect(report.report?.completeness).toBe('PARTIAL');expect(await db.commitAssessment.count()).toBe(0);expect(await db.gitHubCheckPublication.count()).toBe(0)
 if(ruleId==='quality.duplication') expect(report.report?.measurements?.duplication).toMatchObject({analyzedLines:100,duplicatedLines:20})
 if(ruleId==='secrets.scan') { provider.readHealthSource.mockResolvedValue('sensitive fixture\ncontext'); const excerpt=await service.source(owner,'51',first.id,report.report!.findings[0].fingerprint);expect(excerpt.lines[0]?.text).toBe('[Potential credential redacted]');expect(provider.readHealthSource).toHaveBeenCalled() }
 expect(await db.notificationEvent.count()).toBe(1)
})

it('HTTP routes enforce sessions, live scope, CSRF, strict request bodies and private responses',async()=>{
 const server=app.getHttpServer(),key=randomUUID(),post=(body:any,token='owner',origin='http://localhost:5173')=>request(server).post('/github/repositories/51/health').set('Cookie','health.sid='+token).set('Origin',origin).send(body)
 await request(server).get('/github/repositories/51/health').expect(401)
 await post({requestKey:key},'outsider').expect(403);await post({requestKey:key},'developer').expect(403)
 await post({requestKey:key},'owner','https://wrong.example').expect(403)
 await post({requestKey:key,code:'do not execute'}).expect(400);await post({requestKey:'invalid'}).expect(400)
 const result=await post({requestKey:key}).expect(201);expect((await post({requestKey:key}).expect(201)).body.id).toBe(result.body.id)
 await service.process(result.body.id)
 const read=await request(server).get('/github/repositories/51/health').set('Cookie','health.sid=developer').expect(200)
 expect(read.headers['cache-control']).toBe('no-store');expect(read.body.assessment.sourceSha).toBe(sha)
 await request(server).get('/github/repositories/51/health?assessment=bad').set('Cookie','health.sid=owner').expect(400)
 await fixture.prisma.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 await request(server).get('/github/repositories/51/health').set('Cookie','health.sid=owner').expect(403)
})
it('reveals only bounded, redacted context from the assessed revision and rechecks access after source retrieval',async()=>{
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const record=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}}), report=record.report as any, fingerprint='7'.repeat(64)
 report.findings=[{fingerprint,checkId:'security.sast',evidence:'ANALYZER_REPORTED',category:'security',title:'Potential issue',ruleId:'fixture-rule',severity:'high',path:'app.ts',line:8,suppressed:false}]
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:row.id},data:{report}})
 const text=Array.from({length:20},(_,i)=>i===5?'password="sensitive-value"':`line ${i+1}`).join('\n');provider.readHealthSource.mockResolvedValue(text)
 const source=await service.source(developer,'51',row.id,fingerprint)
 expect(provider.readHealthSource).toHaveBeenCalledWith(50n,51n,sha,'app.ts');expect(source.lines.map(l=>l.number)).toEqual([3,4,5,6,7,8,9,10,11,12,13]);expect(JSON.stringify(source)).not.toContain('sensitive-value')
 provider.readHealthSource.mockResolvedValue('only one line');expect(await service.source(developer,'51',row.id,fingerprint)).toEqual(source);expect(provider.readHealthSource).toHaveBeenCalledTimes(1)
 await expect(service.source(outsider,'51',row.id,fingerprint)).rejects.toThrow()
 await fixture.prisma.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 await expect(service.source(developer,'51',row.id,fingerprint)).rejects.toThrow()
})
it('cancellation during inspection wins over completion and never publishes a false completion notification',async()=>{
 const row=await service.initial(owner.identityId,'51'), snapshot=await provider.readRepositorySnapshot()
 provider.readRepositorySnapshot.mockImplementationOnce(async()=>{await service.cancel(owner,'51',row.id);return snapshot})
 await service.process(row.id);await fixture.prisma.repositoryHealthAssessment.update({where:{id:row.id},data:{leaseUntil:null}});await service.process(row.id)
 expect((await service.get(owner,'51')).assessment?.state).toBe('CANCELLED');expect(await fixture.prisma.notificationEvent.count()).toBe(0)
})
it('does not let queue recovery execute a repository after its selection is revoked',async()=>{
 const row=await service.initial(owner.identityId,'51');await fixture.prisma.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 await service.process(row.id);expect(provider.readRepositorySnapshot).not.toHaveBeenCalled();expect((await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})).reason).toBe('ACCESS_REVOKED')
})

async function queuedHealthNative() {
 vi.stubEnv('NATIVE_TOOL_REVIEWS',JSON.stringify([{ruleId:'secrets.scan',image:'registry.example/scanner@sha256:'+'a'.repeat(64),toolVersion:'8.28.0',license:'MIT',configHash:'b'.repeat(64),reviewDigest:'c'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString(),databaseBuiltAt:null}]))
 runtime.status.mockResolvedValue({executionAvailable:true,reason:'READY'})
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const health=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
 return {health,native:await fixture.prisma.nativeExecutionRequest.findUniqueOrThrow({where:{id:health.nativeRequestId!}})}
}
it('rejects health-native plans whose actor or immutable plan has changed',async()=>{
 const {health,native}=await queuedHealthNative(),db=fixture.prisma
 expect(await nativeSelectionCurrent(db,native)).toBe(true)
 expect(await nativeSelectionCurrent(db,{...native,actorId:outsider.identityId})).toBe(false)
 await db.repositoryHealthAssessment.update({where:{id:health.id},data:{plan:{altered:true}}})
 expect(await nativeSelectionCurrent(db,native)).toBe(false)
})
it.each(['QUEUED','PREPARING'])('cancellation tracks native %s until admitted resources acknowledge cleanup',async state=>{
 const {health,native}=await queuedHealthNative(),db=fixture.prisma
 await db.nativeExecutionRequest.update({where:{id:native.id},data:{state}})
 await service.cancel(owner,'51',health.id);await db.repositoryHealthAssessment.update({where:{id:health.id},data:{leaseUntil:null}});await service.process(health.id)
 if(state==='QUEUED') {
  expect((await db.nativeExecutionRequest.findUniqueOrThrow({where:{id:native.id}})).state).toBe('CANCELLED')
 } else {
  expect((await db.nativeExecutionRequest.findUniqueOrThrow({where:{id:native.id}})).state).toBe('CANCEL_REQUESTED')
  expect((await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:health.id}})).state).toBe('RUNNING')
  await db.nativeExecutionRequest.update({where:{id:native.id},data:{state:'CANCELLED',finishedAt:new Date()}})
  await db.repositoryHealthAssessment.update({where:{id:health.id},data:{leaseUntil:null}});await service.process(health.id)
 }
 expect((await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:health.id}})).state).toBe('CANCELLED')
 expect(await db.notificationEvent.count()).toBe(0)
})
it('revoked access cancels unstarted native work without fetching further source',async()=>{
 const {health,native}=await queuedHealthNative(),db=fixture.prisma
 provider.readRepositorySnapshot.mockClear()
 await db.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 await db.repositoryHealthAssessment.update({where:{id:health.id},data:{leaseUntil:null}});await service.process(health.id)
 expect((await db.nativeExecutionRequest.findUniqueOrThrow({where:{id:native.id}})).state).toBe('CANCELLED')
 expect((await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:health.id}})).reason).toBe('ACCESS_REVOKED')
 expect(provider.readRepositorySnapshot).not.toHaveBeenCalled()
})

it('HTTP health portfolio admits authorized readers and keeps reports within live repository scope', async () => {
 const server=app.getHttpServer()
 await request(server).get('/github/health').expect(401)
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 for(const token of ['owner','developer']) {
  const read=await request(server).get('/github/health?page=1').set('Cookie','health.sid='+token).expect(200)
  expect(read.headers['cache-control']).toBe('no-store')
  expect(read.body.items).toHaveLength(1)
  expect(read.body.items[0]).toMatchObject({repositoryId:'51',id:row.id,mode:'INSPECTION_ONLY',findings:null})
 }
 const other=await request(server).get('/github/health').set('Cookie','health.sid=outsider').expect(200)
 expect(other.body.items).toHaveLength(0);expect(JSON.stringify(other.body)).not.toContain(row.id)
 await request(server).get('/github/health?page=0').set('Cookie','health.sid=owner').expect(400)
 await fixture.prisma.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 const revoked=await request(server).get('/github/health').set('Cookie','health.sid=owner').expect(200)
 expect(revoked.body.items).toHaveLength(0);expect(revoked.body.summary.repositories).toBe(0)
})

it('charts available branch reports while comparing only equivalent coverage and respecting the displayed revision', async () => {
 const db=fixture.prisma, first=await service.initial(owner.identityId,'51');await service.process(first.id)
 const stored=await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}})
 const complete={...(stored.report as any),mode:'EXECUTED',completeness:'COMPLETE',comparisonKey:'qualified-tools',findings:[]}
 const create=async(key:string,offset:number,branch='development',report=complete)=>db.repositoryHealthAssessment.create({data:{
  repositoryId:repoId,organizationId:owner.organizationId!,actorId:owner.identityId,branch,targetRevision:1,requestKey:key,
  sourceSha:'b'.repeat(40),state:'COMPLETED',report,createdAt:new Date(Date.now()+offset),finishedAt:new Date(Date.now()+offset)
 }})
 await db.repositoryHealthAssessment.update({where:{id:first.id},data:{report:complete,createdAt:new Date(Date.now()-10000),finishedAt:new Date(Date.now()-10000)}})
 await create('partial',-8000,'development',{...complete,completeness:'PARTIAL'})
 const different=await create('different-tools',-6000,'development',{...complete,comparisonKey:'other-tools'})
 await create('other-branch',-4000,'release')
 const current=await create('current',-2000,'development',{...complete,findings:[{fingerprint:'f'.repeat(64)}]})
 const future=await create('future',0)
 const read=await service.get(owner,'51',current.id,2)
 expect(read.history).toHaveLength(0)
 expect(read.timeline.map(p=>[p.id,p.findings])).toEqual([[first.id,0],[different.id,0],[current.id,1]])
 expect(read.timeline.some(p=>p.id===future.id)).toBe(false)
 expect(read.timeline.map(p=>p.comparableFindings)).toEqual([0,null,1])
 const partial=await db.repositoryHealthAssessment.findFirstOrThrow({where:{requestKey:'partial'}})
 expect((await service.get(owner,'51',partial.id)).timeline).toMatchObject([{id:first.id,findings:0,comparableFindings:null}])
})

it('filters the health summary and priority findings by an authorized repository', async () => {
 const db=fixture.prisma, row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const stored=await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
 const findings=Array.from({length:7},(_,i)=>({fingerprint:String(i).repeat(64),category:'security',severity:i===6?'critical':'high',title:'Located issue '+i,ruleId:'rule',path:'src/file.ts',line:i+1,checkId:'security.sast',evidence:'verified'}))
 await db.repositoryHealthAssessment.update({where:{id:row.id},data:{report:{...(stored.report as any),mode:'EXECUTED',completeness:'PARTIAL',analyses:[{id:'security.sast',findingsRetained:7}],findings}}})
 await db.gitHubRepository.create({data:{githubId:52n,installationId:50n,name:'second',fullName:'fixture/second',ownerLogin:'fixture',isPrivate:true,selected:true,defaultBranch:'main'}})
 const read=await request(app.getHttpServer()).get('/github/health?repository=51').set('Cookie','health.sid=owner').expect(200)
 expect(read.body.summary).toMatchObject({repositories:1,assessed:1,high:7,incomplete:1})
 expect(read.body.statuses).toEqual({complete:0,partial:1,failed:0,cancelled:0})
 expect(read.body.priorityFindings).toHaveLength(5)
 expect(read.body.priorityFindings[0]).toMatchObject({repositoryId:'51',assessmentId:row.id,severity:'critical',path:'src/file.ts',line:7})
 const other=await service.portfolio(owner,1,'','52')
 expect(other.summary.repositories).toBe(1);expect(other.priorityFindings).toEqual([])
 expect((await service.portfolio(owner)).summary.repositories).toBe(2)
 await request(app.getHttpServer()).get('/github/health?repository=52').set('Cookie','health.sid=developer').expect(403)
 await request(app.getHttpServer()).get('/github/health?repository=51').set('Cookie','health.sid=outsider').expect(403)
 await request(app.getHttpServer()).get('/github/health?repository=invalid').set('Cookie','health.sid=owner').expect(400)
 await db.gitHubRepository.update({where:{id:repoId},data:{selected:false}})
 await request(app.getHttpServer()).get('/github/health?repository=51').set('Cookie','health.sid=owner').expect(403)
})

it('can load bounded inventory health beyond the first report page and validates the batch size', async () => {
 const db=fixture.prisma
 await db.gitHubRepository.createMany({data:Array.from({length:27},(_,i)=>({githubId:BigInt(100+i),installationId:50n,name:'repo-'+i,fullName:'fixture/repo-'+i,ownerLogin:'fixture',isPrivate:true,selected:true,defaultBranch:'main'}))})
 expect((await service.portfolio(owner)).items).toHaveLength(25)
 const read=await request(app.getHttpServer()).get('/github/health?pageSize=1000').set('Cookie','health.sid=owner').expect(200)
 expect(read.body.items).toHaveLength(28)
 expect(read.body.items.every((item:any)=>item.state==='NOT_ASSESSED')).toBe(true)
 const scoped=await request(app.getHttpServer()).get('/github/health?pageSize=1000').set('Cookie','health.sid=developer').expect(200)
 expect(scoped.body.items.map((item:any)=>item.repositoryId)).toEqual(['51'])
 for(const size of ['0','1001','NaN','1.5']) await request(app.getHttpServer()).get('/github/health?pageSize='+size).set('Cookie','health.sid=owner').expect(400)
})

it('returns saved reports while an upstream head check is blocked and rechecks permissions on freshness responses',async()=>{
 const report=await service.initial(owner.identityId,'51');await service.process(report.id)
 await fixture.prisma.repositoryHealthTarget.update({where:{repositoryId:repoId},data:{headCheckedAt:new Date(0),headSha:sha}})
 provider.verifyReadinessBranch.mockClear()
 const saved=await service.get(developer,'51',report.id)
 expect(saved.assessment?.id).toBe(report.id);expect(saved.freshness).toBe('UNVERIFIED');expect(provider.verifyReadinessBranch).not.toHaveBeenCalled()
 let release!:()=>void
 const upstream=new Promise<string>(resolve=>{release=()=>resolve(sha)})
 provider.verifyReadinessBranch.mockReturnValueOnce(upstream)
 const checking=service.freshness(developer,'51',report.id)
 await vi.waitFor(()=>expect(provider.verifyReadinessBranch).toHaveBeenCalledTimes(1))
 const during=await service.get(developer,'51',report.id)
 expect(during.assessment?.id).toBe(report.id);expect(during.freshness).toBe('UNVERIFIED')
 release();expect((await checking).freshness).toBe('CURRENT')
 await fixture.prisma.repositoryHealthTarget.update({where:{repositoryId:repoId},data:{headCheckedAt:new Date(0)}})
 provider.verifyReadinessBranch.mockImplementationOnce(async()=>{await fixture.prisma.repositoryGrant.deleteMany();return sha})
 await expect(service.freshness(developer,'51',report.id)).rejects.toThrow()
})
it('freshness HTTP responses remain scoped, private and fail honestly when GitHub is unavailable',async()=>{
 const report=await service.initial(owner.identityId,'51');await service.process(report.id)
 const url=`/github/repositories/51/health/freshness?assessment=${report.id}`,server=app.getHttpServer()
 await request(server).get(url).expect(401)
 await request(server).get(url).set('Cookie','health.sid=outsider').expect(403)
 await request(server).get('/github/repositories/51/health/freshness?assessment=bad').set('Cookie','health.sid=owner').expect(400)
 provider.verifyReadinessBranch.mockRejectedValueOnce(new Error('private-provider-value'))
 await fixture.prisma.repositoryHealthTarget.update({where:{repositoryId:repoId},data:{headCheckedAt:new Date(0)}})
 const result=await request(server).get(url).set('Cookie','health.sid=owner').expect(200)
 expect(result.headers['cache-control']).toBe('no-store');expect(result.body).toMatchObject({assessmentId:report.id,freshness:'UNVERIFIED'});expect(JSON.stringify(result.body)).not.toContain('private-provider-value')
})

it('persists revision-specific hotspot reviews with rationale, audit, conflicts and live scoped permissions',async()=>{
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const stored=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
 const fingerprint='8'.repeat(64)
 const report:any={...(stored.report as any),mode:'EXECUTED',analyses:[{id:'security.hotspots',title:'Security hotspot review',state:'FAIL',reason:'FINDINGS_REPORTED',findingsReported:1,findingsRetained:1,findingsSuppressed:0}],findings:[{fingerprint,category:'hotspot',checkId:'security.hotspots',severity:'low',title:'Review MD5 use',ruleId:'preflyt-js-md5-review',path:'app.ts',line:1,evidence:'ANALYZER_REPORTED',suppressed:false}]}
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:row.id},data:{report}})
 const original=structuredClone(report)
 const path=`/github/repositories/51/health/${row.id}/hotspots/${fingerprint}/review`
 await request(app.getHttpServer()).get(path).expect(401)
 const view=await request(app.getHttpServer()).get(path).set('Cookie','health.sid=developer').expect(200)
 expect(view.body).toMatchObject({state:'TO_REVIEW',revision:0,canReview:false});expect(view.headers['cache-control']).toBe('no-store')
 const save=(body:any,actor='owner',origin='http://localhost:5173')=>request(app.getHttpServer()).post(path).set('Cookie','health.sid='+actor).set('Origin',origin).send(body)
 await save({state:'SAFE',note:'Only a non-security content checksum.',expectedRevision:0},'developer').expect(403)
 await save({state:'SAFE',note:'',expectedRevision:0}).expect(400)
 await save({state:'SAFE',note:'Bearer confidential',expectedRevision:0}).expect(400)
 await save({state:'SAFE',note:'Valid',expectedRevision:0,sourceSha:'fake'}).expect(400)
 await save({state:'SAFE',note:'Valid',expectedRevision:0},'owner','https://wrong.example').expect(403)
 await save({state:'SAFE',note:'Valid',expectedRevision:0},'outsider').expect(403)
 const direct=await service.saveHotspotReview(owner,'51',row.id,fingerprint,{state:'IN_REVIEW',note:'Inspecting the context.',expectedRevision:0})
 expect(direct.revision).toBe(1)
 const saved=await save({state:'SAFE',note:'Only a non-security content checksum.',expectedRevision:1}).expect(201)
 expect(saved.body).toMatchObject({state:'SAFE',revision:2})
 await save({state:'FIX_REQUIRED',note:'Security sensitive.',expectedRevision:0}).expect(409)
 expect((await service.get(owner,'51',row.id)).hotspotReview).toMatchObject({reviewed:1,total:1,percentage:100})
 await save({state:'TO_REVIEW',note:'Reopened for review.',expectedRevision:2}).expect(201)
 expect((await service.get(owner,'51',row.id)).hotspotReview?.percentage).toBe(0)
 expect((await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})).report).toEqual(original)
 expect(await fixture.prisma.commitAssessment.count()).toBe(0);expect(await fixture.prisma.gitHubCheckPublication.count()).toBe(0)
 expect(await fixture.prisma.auditEvent.count({where:{event:'repository.health.hotspot_reviewed'}})).toBe(3)
 const second=await fixture.prisma.repositoryHealthAssessment.create({data:{repositoryId:repoId,organizationId:owner.organizationId!,branch:'development',targetRevision:1,requestKey:'second-hotspot-report',actorId:owner.identityId,sourceSha:'b'.repeat(40),state:'COMPLETED',report}})
 expect((await service.hotspotReview(owner,'51',second.id,fingerprint)).revision).toBe(0)
 expect((await service.get(owner,'51',second.id)).hotspotReview?.reviewed).toBe(0)
 await fixture.prisma.organizationMembership.updateMany({where:{identityId:owner.identityId},data:{active:false}})
 await expect(service.saveHotspotReview(owner,'51',row.id,fingerprint,{state:'SAFE',note:'Revoked.',expectedRevision:3})).rejects.toThrow()
})

it('runs one Health category at a time and keeps same-commit results from earlier category runs available',async()=>{
 const key=randomUUID()
 const first=await service.start(owner,'51',{requestKey:key,category:'reliability'})
 expect(first.category).toBe('reliability')
 expect((await service.start(owner,'51',{requestKey:key,category:'reliability'})).id).toBe(first.id)
 await expect(service.start(owner,'51',{requestKey:key,category:'coverage'})).rejects.toThrow('different assessment scope')
 await service.process(first.id);await service.process(first.id)
 const saved=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}})
 expect((saved.plan as any).steps.filter((step:any)=>step.ruleId).map((step:any)=>step.ruleId)).toEqual(['quality.reliability'])
 expect((saved.report as any).selection).toBe('reliability')
 expect((saved.report as any).analyses.map((a:any)=>a.id)).toEqual(['quality.reliability'])
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:first.id},data:{report:{...(saved.report as any),mode:'EXECUTED',analyses:[{...(saved.report as any).analyses[0],state:'PASS',reason:'CHECKS_PASSED',findingsRetained:0,findingsReported:0,reportHash:'f'.repeat(64)}]}}})
 const second=await service.start(owner,'51',{requestKey:randomUUID(),category:'coverage'})
 await service.process(second.id);await service.process(second.id)
 const result=await service.get(owner,'51')
 expect(result.assessment).toMatchObject({id:second.id,category:'coverage',report:{selection:'coverage',completeness:'PARTIAL',analyses:[{id:'tests.coverage'}]}})
 expect(result.categoryResults.reliability).toMatchObject({assessmentId:first.id,value:'0'})
 expect(result.categoryResults.coverage).toBeNull()
 expect((await service.portfolio(owner)).items[0].result).toBe('INCOMPLETE')
 const server=app.getHttpServer()
 await request(server).post('/github/repositories/51/health').set('Cookie','health.sid=owner').set('Origin','http://localhost:5173').send({requestKey:randomUUID(),category:'unknown'}).expect(400)
})
it('explains when a selected category has no applicable files instead of claiming a clean result',async()=>{
 provider.readRepositorySnapshot.mockResolvedValueOnce({sourceSha:sha,treeSha:'b'.repeat(40),branch:'development',fullName:'fixture/repo',complete:true,warnings:[],files:[{path:'README.md',sha:'c'.repeat(40),size:20}]})
 const row=await service.start(owner,'51',{requestKey:randomUUID(),category:'reliability'})
 await service.process(row.id)
 expect((await service.get(owner,'51')).assessment).toMatchObject({state:'FAILED',reason:'NO_APPLICABLE_ANALYSIS',category:'reliability',sourceSha:null})
})
it('includes test discovery by default and rejects malformed coverage input',async()=>{
 const first=await service.initial(owner.identityId,'51')
 expect((await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}})).includeCoverage).toBe(true)

 await service.process(first.id)
 expect((await service.get(owner,'51',first.id)).assessment?.report?.analyses.map(a=>a.id)).toContain('tests.coverage')
 await request(app.getHttpServer()).post('/github/repositories/51/health').set('Cookie','health.sid=owner').set('Origin','http://localhost:5173').send({requestKey:randomUUID(),includeCoverage:true}).expect(409)
 await request(app.getHttpServer()).post('/github/repositories/51/health').set('Cookie','health.sid=owner').set('Origin','http://localhost:5173').send({requestKey:randomUUID(),includeCoverage:'true'}).expect(400)
})

it('captures the branch policy once and retains it when published policy changes later',async()=>{
 const definition={branchRef:'refs/heads/development',selectionId:'policy-selection',rules:[{id:'tests.required',required:true}]}
 const policy=await fixture.prisma.gatePolicyRevision.create({data:{repositoryId:repoId,organizationId:owner.organizationId!,branchRef:definition.branchRef,revision:1,selectionId:definition.selectionId,definition,definitionHash:digest(definition),state:'PUBLISHED',draftedById:owner.identityId,publishedAt:new Date()}})
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const captured=(await service.get(owner,'51',row.id)).assessment?.report as any
 expect(captured.policyContext).toMatchObject({state:'CAPTURED',policyId:policy.id,revision:1,requirements:1,evidence:{state:'UNAVAILABLE',percentage:null}})
 const next={...definition,rules:[{id:'tests.required',required:true},{id:'security.sast',required:true}]}
 await fixture.prisma.gatePolicyRevision.create({data:{repositoryId:repoId,organizationId:owner.organizationId!,branchRef:definition.branchRef,revision:2,selectionId:definition.selectionId,definition:next,definitionHash:digest(next),state:'PUBLISHED',draftedById:owner.identityId,publishedAt:new Date(Date.now()+1000)}})
 expect(((await service.get(owner,'51',row.id)).assessment?.report as any).policyContext).toEqual(captured.policyContext)
 expect(await fixture.prisma.commitAssessment.count()).toBe(0)
})

it('returns a passing outcome only for a completed fully analyzed clean report in the authorized portfolio',async()=>{
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const stored=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:row.id}})
 const report={...(stored.report as any),mode:'EXECUTED',completeness:'COMPLETE',findings:[],analyses:[{id:'secrets.scan',title:'Secrets',state:'PASS',reason:'CHECKS_PASSED',findingsRetained:0,findingsReported:0}]}
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:row.id},data:{state:'COMPLETED',report}})
 expect((await service.portfolio(owner)).items[0].result).toBe('PASS')
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:row.id},data:{report:{...report,completeness:'PARTIAL'}}})
 expect((await service.portfolio(owner)).items[0].result).toBe('INCOMPLETE')
 expect((await service.portfolio(outsider)).items).toHaveLength(0)
})

it('selects overall health from the selected branch instead of a newer report on another branch',async()=>{
 const db=fixture.prisma
 const repo=await db.gitHubRepository.findUniqueOrThrow({where:{githubId:51n}})
 const healthy:any={mode:'EXECUTED',completeness:'COMPLETE',inspection:{complete:true},findings:[],analyses:[{id:'security.sast',title:'Security',state:'PASS',findingsRetained:0,findingsReported:0}]}
 const selected=await service.start(owner,'51',{branch:'main',requestKey:randomUUID()})
 await db.repositoryHealthAssessment.update({where:{id:selected.id},data:{state:'COMPLETED',sourceSha:'a'.repeat(40),report:healthy}})
 await db.repositoryHealthAssessment.create({data:{repositoryId:repo.id,organizationId:owner.organizationId!,actorId:owner.identityId,branch:'other',targetRevision:1,requestKey:randomUUID(),state:'COMPLETED',sourceSha:'b'.repeat(40),report:{...healthy,findings:[{severity:'critical'}]},createdAt:new Date(Date.now()+1000)}})
 expect((await service.portfolio(owner)).items[0]).toMatchObject({id:selected.id,branch:'main',overallHealth:{status:'HEALTHY'}})
})


it('keeps priority findings on the selected branch, including when its report is older',async()=>{
 const db=fixture.prisma, repo=await db.gitHubRepository.findUniqueOrThrow({where:{githubId:51n}})
 const issue=(title:string,fingerprint:string)=>({fingerprint,category:'security',checkId:'security.sast',severity:'critical',title,ruleId:'rule',path:'app.ts',line:1,evidence:'ANALYZER_REPORTED',suppressed:false})
 const report=(findings:any[])=>({mode:'EXECUTED',completeness:'COMPLETE',inspection:{complete:true},findings,analyses:[{id:'security.sast',title:'Security',state:findings.length?'FAIL':'PASS',findingsRetained:findings.length,findingsReported:findings.length}]})
 const selected=await service.start(owner,'51',{branch:'main',requestKey:randomUUID()})
 await db.repositoryHealthAssessment.update({where:{id:selected.id},data:{state:'COMPLETED',sourceSha:sha,report:report([issue('Selected branch issue','1'.repeat(64))])}})
 await db.repositoryHealthAssessment.create({data:{repositoryId:repo.id,organizationId:owner.organizationId!,actorId:owner.identityId,branch:'other',targetRevision:1,requestKey:randomUUID(),state:'COMPLETED',sourceSha:'b'.repeat(40),report:report([issue('Other branch issue','2'.repeat(64))]),createdAt:new Date(Date.now()+1000)}})
 const result=await service.portfolio(owner)
 expect(result.summary.high).toBe(1)
 expect(result.items[0]).toMatchObject({id:selected.id,branch:'main',overallHealth:{status:'UNHEALTHY'}})
 expect(result.priorityFindings).toEqual([expect.objectContaining({assessmentId:selected.id,branch:'main',title:'Selected branch issue'})])
 await db.repositoryHealthAssessment.update({where:{id:selected.id},data:{report:report([])}})
 const clean=await service.portfolio(owner)
 expect(clean.items[0].overallHealth.status).toBe('HEALTHY')
 expect(clean.summary.high).toBe(0)
 expect(clean.priorityFindings).toEqual([])
})

it('saves scoped test overrides with CSRF, conflict detection, audit and immutable assessment settings',async()=>{
 const first=await service.initial(owner.identityId,'51')
 const before=await service.get(owner,'51')
 const settings={command:'npm run unit --',directory:'.',framework:'jest',expectedRevision:before.testSettingsRevision}
 await expect(service.saveTestSettings(developer,'51',settings)).rejects.toThrow()
 await expect(service.saveTestSettings(outsider,'51',settings)).rejects.toThrow()
 const endpoint='/github/repositories/51/health/test-settings',server=app.getHttpServer()
 await request(server).post(endpoint).set('Cookie','health.sid=owner').set('Origin','https://untrusted.example').send(settings).expect(403)
 await request(server).post(endpoint).set('Cookie','health.sid=owner').set('Origin','http://localhost:5173').send({...settings,secret:'not-allowed'}).expect(400)
 await request(server).post(endpoint).set('Cookie','health.sid=owner').set('Origin','http://localhost:5173').send(settings).expect(201)
 await expect(service.saveTestSettings(owner,'51',settings)).rejects.toThrow('Test settings changed')
 expect((await service.get(owner,'51')).testSettings).toMatchObject({command:settings.command,framework:'jest'})
 expect((await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:first.id}})).testSettings).toMatchObject({command:'',framework:'auto'})
 expect(await fixture.prisma.auditEvent.count({where:{event:'repository.health.tests.configured'}})).toBe(1)
})

it('retains a safe GitHub retry time and exposes the reason for pre-report failures only to authorized readers', async () => {
 provider.readRepositorySnapshot.mockRejectedValueOnce(new GitHubRateLimitError(60000))
 const queued=await service.initial(owner.identityId,'51')
 await service.process(queued.id)
 const read=await service.get(owner,'51')
 expect(read.assessment).toMatchObject({state:'FAILED',sourceSha:null,report:null,reason:'GITHUB_RATE_LIMITED'})
 expect(Date.parse(read.assessment!.retryAt!)).toBeGreaterThan(Date.now())
 expect(read.history[0].retryAt).toBe(read.assessment!.retryAt)
 expect(JSON.stringify(read)).not.toContain('retryAfterSeconds')
 await expect(service.get(outsider,'51')).rejects.toThrow()
})

it.each(['GIT_UNAVAILABLE','SOURCE_FETCH_FAILED','SOURCE_FETCH_TIMED_OUT','SOURCE_FETCH_LIMIT_EXCEEDED'] as const)('records safe Git failure %s without admitting scanners',async(code)=>{
 const scanner={package:vi.fn(async()=>({})),call:vi.fn()}
 provider.readHealthScanSource.mockRejectedValueOnce(new HealthGitSourceError(code))
 service=new RepositoryHealthService(fixture.prisma,new AuthorizationService(fixture.prisma),provider as any,runtime as any,new FindingSourceStore(fixture.prisma,provider as any),scanner as any)
 const row=await service.initial(owner.identityId,'51');await service.process(row.id)
 const result=await service.get(owner,'51')
 expect(result.assessment).toMatchObject({state:'FAILED',reason:code,sourceSha:sha,report:{mode:'INSPECTION_ONLY'}})
 expect(result.assessment!.report!.analyses.every(a=>a.reason===code)).toBe(true)
 expect(scanner.call).not.toHaveBeenCalled()
})

it('discovers selectable test apps with repository authorization',async()=>{
 await service.initial(owner.identityId,'51');
 provider.readRepositorySnapshot.mockResolvedValue({sourceSha:sha,branch:'development',complete:true,files:[{path:'api/package.json',content:JSON.stringify({name:'API',scripts:{test:'node --test tests/*.js'}})},{path:'performance/package.json',content:JSON.stringify({name:'Performance',scripts:{test:'vitest run'}})}]});
 const found=await service.testApps(owner,'51');expect(found.apps).toEqual([{directory:'api',name:'API',framework:'node'},{directory:'performance',name:'Performance',framework:'vitest'}]);
 await expect(service.testApps(outsider,'51')).rejects.toThrow();
 const current=await service.get(owner,'51');
 await service.saveTestSettings(owner,'51',{packageDirectory:'api',expectedRevision:current.testSettingsRevision});
 expect((await service.get(owner,'51')).testSettings).toMatchObject({packageDirectory:'api',framework:'auto',command:''});
});
