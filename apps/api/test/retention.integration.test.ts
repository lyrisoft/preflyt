import 'reflect-metadata'
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest'
import {disposableDatabase} from './disposable-database.js'
import {RetentionService} from '../src/retention/retention.service.js'
import {AuthorizationService} from '../src/auth/authorization.service.js'
import type {AuthenticatedSession} from '../src/auth/session.guard.js'
let fixture:Awaited<ReturnType<typeof disposableDatabase>>, service:RetentionService, owner:AuthenticatedSession, other:AuthenticatedSession, viewer:AuthenticatedSession, repoId:string, otherRepo:string
const ago=(days:number)=>new Date(Date.now()-days*86400000)
const input=(revision=1)=>({revision,enabled:true,assessmentDays:90,sourceDays:90,notificationDays:90,activityDays:90,auditDays:365})
beforeAll(async()=>{fixture=await disposableDatabase('retention')})
afterAll(async()=>{await fixture.close();vi.unstubAllEnvs()})
beforeEach(async()=>{
 await fixture.reset();vi.unstubAllEnvs();const db=fixture.prisma
 async function workspace(n:number,role:'OWNER'|'VIEWER'='OWNER'){
  const org=await db.organization.create({data:{name:`Workspace ${n}`}}),identity=await db.identity.create({data:{issuer:'fixture',subject:String(n)}})
  await db.organizationMembership.create({data:{organizationId:org.id,identityId:identity.id,role}})
  await db.gitHubInstallation.create({data:{id:BigInt(n),organizationId:org.id,connectedById:identity.id,accountLogin:`fixture${n}`,accountType:'Organization',repositorySelection:'all',permissions:{}}})
  const repo=await db.gitHubRepository.create({data:{githubId:BigInt(n),installationId:BigInt(n),fullName:`fixture${n}/app`,ownerLogin:`fixture${n}`,name:'app',isPrivate:true,selected:true}})
  return {session:{authenticated:true,organizationId:org.id,identityId:identity.id,role,subject:String(n),email:null} as AuthenticatedSession,repo:repo.id}
 }
 const a=await workspace(1),b=await workspace(2),v=await workspace(3,'VIEWER');owner=a.session;repoId=a.repo;other=b.session;otherRepo=b.repo;viewer=v.session
 service=new RetentionService(db,new AuthorizationService(db))
})
async function assessment(id:string,repositoryId=repoId,days=120){return fixture.prisma.commitAssessment.create({data:{id,repositoryId,sourceSha:id.padEnd(40,'a').slice(0,40),selectionId:'selection',requestKey:id,inputHash:id,request:{},plan:{},report:{},assessmentHash:id,createdAt:ago(days)}})}
it('defaults to disabled, enforces admin scope, validates periods and rejects stale saves',async()=>{
 expect(await service.get(owner)).toMatchObject({enabled:false,assessmentDays:90,auditDays:365})
 await expect(service.get(viewer)).rejects.toThrow()
 await expect(service.save(viewer,input())).rejects.toThrow()
 await expect(service.save(owner,{...input(),auditDays:89})).rejects.toThrow('90')
 await expect(service.save(owner,{...input(),sourceDays:1.5})).rejects.toThrow()
 await expect(service.save(owner,{...input(),organizationId:other.organizationId})).rejects.toThrow()
 expect(await service.save(owner,input())).toMatchObject({enabled:true,revision:2})
 await expect(service.save(owner,input())).rejects.toThrow('changed')
 expect(await fixture.prisma.auditEvent.count({where:{event:'retention.settings_updated'}})).toBe(1)
})
it('preview is non-destructive and tenant scoped; cleanup keeps latest and referenced CI assessments',async()=>{
 const db=fixture.prisma
 await assessment('old');await assessment('latest',repoId,100);await assessment('other-old',otherRepo,150);await assessment('other-new',otherRepo,100)
 await assessment('linked',repoId,140)
 await db.pipelineRunSubmission.create({data:{id:'submission',repositoryId:repoId,organizationId:owner.organizationId!,policyId:'p',policyHash:'h',sourceSha:'a'.repeat(40),workflowSha:'b'.repeat(40),runId:'1',runAttempt:1,prNumber:1,inputHash:'h',payload:{},submittedById:owner.identityId,state:'COMPLETED',assessmentId:'linked'}})
 await service.get(owner)
 const preview=await service.preview(owner,input())
 expect(preview.items.find(x=>x.kind==='assessmentDays')?.eligible).toBe(1)
 expect(await db.commitAssessment.count()).toBe(5)
 await service.reconcile();expect(await db.commitAssessment.count()).toBe(5)
 await service.save(owner,input());await Promise.all([service.reconcile(),new RetentionService(db,new AuthorizationService(db)).reconcile()])
 expect(await db.commitAssessment.findUnique({where:{id:'old'}})).toBeNull()
 expect(await db.commitAssessment.count()).toBe(4)
 expect(await service.get(owner)).toMatchObject({lastError:false,lastResult:{assessmentDays:1}})
 expect(await db.auditEvent.count({where:{event:'retention.cleanup_completed'}})).toBe(1)
})
it('removes expired excerpts and routine audits while preserving active capture, decisions and other workspaces',async()=>{
 const db=fixture.prisma
 for(const [id,repositoryId,retryAfter] of [['expired',repoId,ago(1)],['leased',repoId,new Date(Date.now()+60000)],['other',otherRepo,ago(1)]] as const)
  await db.findingSourceExcerpt.create({data:{id,repositoryId,sourceSha:'a'.repeat(40),path:'app.ts',createdAt:ago(100),retryAfter}})
 for(const [event,organizationId] of [['authorization_denied',owner.organizationId],['policy.published',owner.organizationId],['github.display_refresh_requested',owner.organizationId],['authorization_denied',other.organizationId]] as const)
  await db.auditEvent.create({data:{event,metadata:{organizationId},createdAt:ago(400)}})
 await service.get(owner);await service.save(owner,input());await service.reconcile()
 expect(await db.findingSourceExcerpt.count()).toBe(2)
 expect(await db.auditEvent.count({where:{event:'authorization_denied',metadata:{path:['organizationId'],equals:owner.organizationId!}}})).toBe(0)
 expect(await db.auditEvent.count({where:{event:{in:['policy.published','github.display_refresh_requested']}}})).toBe(2)
 expect(await db.auditEvent.count({where:{event:'authorization_denied'}})).toBe(1)
})
it('keeps pending notification deliveries and cascades completed history only',async()=>{
 const db=fixture.prisma
 for(const id of ['complete','pending','email-pending'])await db.notificationEvent.create({data:{id,organizationId:owner.organizationId!,repositoryId:repoId,repositoryGithubId:'1',repositoryName:'fixture/app',type:'assessment',severity:'info',createdAt:ago(100),deliveredAt:id==='pending'?null:ago(99)}})
 const inbox=await db.inboxNotification.create({data:{eventId:'email-pending',identityId:owner.identityId}})
 await db.notificationEmailDelivery.create({data:{inboxId:inbox.id,state:'PENDING'}})
 await service.get(owner);await service.save(owner,input());await service.reconcile()
 expect(await db.notificationEvent.findUnique({where:{id:'complete'}})).toBeNull()
 expect(await db.notificationEvent.count()).toBe(2)
})
it('honors deployment pause, active leases, revision conflicts and bounded batches',async()=>{
 const db=fixture.prisma
 await service.get(owner);await service.save(owner,input())
 for(let i=0;i<14;i++)await assessment(`batch-${i}`,repoId,120+i)
 vi.stubEnv('RETENTION_CLEANUP_ENABLED','false');await service.reconcile();expect(await db.commitAssessment.count()).toBe(14)
 vi.stubEnv('RETENTION_CLEANUP_ENABLED','true');vi.stubEnv('RETENTION_CLEANUP_BATCH','10')
 await service.reconcile();expect(await db.commitAssessment.count()).toBe(4)
 await db.workspaceRetention.updateMany({data:{leaseToken:'other-worker',leaseUntil:new Date(Date.now()+60000)}})
 await expect(service.save(owner,input(2))).rejects.toThrow()
 await expect(service.requestCleanup(owner,2)).rejects.toThrow()
 await service.reconcile();expect(await db.commitAssessment.count()).toBe(4)
 await db.workspaceRetention.updateMany({data:{leaseUntil:null,leaseToken:null}})
 await service.requestCleanup(owner,2);await service.reconcile();expect(await db.commitAssessment.count()).toBe(1)
})
it('rechecks active membership within the settings transaction',async()=>{
 await service.get(owner)
 const access={requireOrganization:vi.fn(async()=>{await fixture.prisma.organizationMembership.updateMany({where:{identityId:owner.identityId},data:{active:false}});return {organizationId:owner.organizationId}})}
 await expect(new RetentionService(fixture.prisma,access as any).save(owner,input())).rejects.toThrow('active workspace')
 expect((await fixture.prisma.workspaceRetention.findUniqueOrThrow({where:{organizationId:owner.organizationId!}})).enabled).toBe(false)
})
it('protects HTTP reads and writes with session, admin and origin checks',async()=>{
 const {NestFactory}=await import('@nestjs/core'),{Module,ForbiddenException}=await import('@nestjs/common')
 const {RetentionController}=await import('../src/retention/retention.controller.js'),{SessionGuard}=await import('../src/auth/session.guard.js'),{AuthService}=await import('../src/auth/auth.service.js')
 const http=(await import('supertest')).default
 class FixtureModule{}
 Module({controllers:[RetentionController],providers:[
  {provide:RetentionService,useValue:service},
  {provide:AuthorizationService,useValue:new AuthorizationService(fixture.prisma)},
  {provide:AuthService,useValue:{sessionCookieName:'test.sid',currentSession:async(token:string)=>token==='viewer'?viewer:token==='owner'?owner:{authenticated:false},assertOrigin(origin:string){if(origin!=='https://preflyt.test')throw new ForbiddenException('Origin rejected')}}},
  SessionGuard,
 ]})(FixtureModule)
 const app=await NestFactory.create(FixtureModule,{logger:false,abortOnError:false});app.use((await import('cookie-parser')).default());await app.init()
 try{
  await http(app.getHttpServer()).get('/retention').expect(401)
  await http(app.getHttpServer()).get('/retention').set('Cookie','test.sid=viewer').expect(403)
  const initial=await http(app.getHttpServer()).get('/retention').set('Cookie','test.sid=owner').expect(200)
  expect(initial.headers['cache-control']).toBe('no-store')
  await http(app.getHttpServer()).patch('/retention').set('Cookie','test.sid=owner').set('Origin','https://other.test').send(input()).expect(403)
  await http(app.getHttpServer()).post('/retention/preview').set('Cookie','test.sid=owner').set('Origin','https://preflyt.test').send(input()).expect(201)
  expect((await service.get(owner)).enabled).toBe(false)
  await http(app.getHttpServer()).patch('/retention').set('Cookie','test.sid=owner').set('Origin','https://preflyt.test').send(input()).expect(200)
  await http(app.getHttpServer()).post('/retention/cleanup').set('Cookie','test.sid=owner').set('Origin','https://preflyt.test').send({revision:2}).expect(201)
 }finally{await app.close()}
})
