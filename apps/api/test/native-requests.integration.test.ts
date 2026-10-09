import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { NestFactory } from '@nestjs/core'
import { ForbiddenException, ValidationPipe, type INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import http from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { SessionGuard, type AuthenticatedSession } from '../src/auth/session.guard.js'
import { NativeRequestController } from '../src/execution/native-request.controller.js'
import { NativeRequestService } from '../src/execution/native-request.service.js'
import { NativePlanService } from '../src/execution/native-plan.service.js'
import { NativeStatusService } from '../src/execution/native-status.service.js'
import type { GitHubRepository } from '../src/generated/prisma/client.js'
let db:PrismaService, admin:Client, created=false, app:INestApplication, repo:GitHubRepository, org:string, owner:AuthenticatedSession, developer:AuthenticatedSession, outsider:AuthenticatedSession, service:NativeRequestService, plans:NativePlanService
const name='preflyt_native_test_'+randomUUID().replaceAll('-','')
const status={status:vi.fn()}
const root='/github/repositories/51/native-execution/requests'
const get=(actor=owner,path=root)=>http(app.getHttpServer()).get(path).set('Cookie',`native.sid=${actor.identityId}`)
const post=(actor:AuthenticatedSession,path:string,body:unknown)=>http(app.getHttpServer()).post(path).set('Cookie',`native.sid=${actor.identityId}`).set('Origin','http://localhost:5173').send(body)
beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Local disposable database required')
  admin=new Client({connectionString:url.toString()});await admin.connect();await admin.query(`CREATE DATABASE "${name}"`);created=true
  url.pathname='/'+name;const sql=new Client({connectionString:url.toString()});await sql.connect()
  try{for(const entry of (await readdir('prisma/migrations')).filter(n=>/^\d/.test(n)).sort())await sql.query(await readFile(`prisma/migrations/${entry}/migration.sql`,'utf8'))}finally{await sql.end()}
  vi.stubEnv('DATABASE_URL',url.toString());db=new PrismaService();await db.$connect()
  const access=new AuthorizationService(db);plans=new NativePlanService(access,db);service=new NativeRequestService(db,access,plans,status as any)
  app=await NestFactory.create({module:class NativeTest{},controllers:[NativeRequestController],providers:[SessionGuard,{provide:NativeRequestService,useValue:service},{provide:AuthorizationService,useValue:access},{provide:AuthService,useValue:{sessionCookieName:'native.sid',assertOrigin:(origin:string)=>{if(origin!=='http://localhost:5173')throw new ForbiddenException('Invalid origin')},currentSession:async(id?:string)=>[owner,developer,outsider].find(a=>a?.identityId===id)??{authenticated:false}}}]},{logger:false})
  app.use(cookieParser());app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init()
},30000)
afterAll(async()=>{await app?.close();await db?.$disconnect();if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin?.end();vi.unstubAllEnvs()})
beforeEach(async()=>{
  vi.clearAllMocks();vi.stubEnv('NATIVE_TOOL_REVIEWS','[]')
  status.status.mockResolvedValue({preflightVerified:false,reason:'PREFLIGHT_DISABLED'})
  await db.gitHubRepository.deleteMany();await db.gitHubInstallation.deleteMany();await db.organization.deleteMany();await db.identity.deleteMany();await db.auditEvent.deleteMany()
  org=(await db.organization.create({data:{name:'native fixture'}})).id
  const make=async(subject:string,role:'OWNER'|'DEVELOPER',organizationId=org)=>{
    const identity=await db.identity.create({data:{issuer:'fixture',subject}})
    await db.organizationMembership.create({data:{identityId:identity.id,organizationId,role}})
    return {authenticated:true as const,identityId:identity.id,subject,email:null,role,organizationId}
  }
  owner=await make('owner','OWNER');developer=await make('developer','DEVELOPER')
  outsider=await make('outsider','OWNER',(await db.organization.create({data:{name:'other fixture'}})).id)
  await db.gitHubInstallation.create({data:{id:50n,connectedById:owner.identityId,accountLogin:'fixture',accountType:'Organization',repositorySelection:'selected',permissions:{},organizationId:org}})
  repo=await db.gitHubRepository.create({data:{githubId:51n,installationId:50n,name:'repo',fullName:'fixture/repo',ownerLogin:'fixture',isPrivate:true,selected:true}})
  const membership=await db.organizationMembership.findFirstOrThrow({where:{identityId:developer.identityId}})
  await db.repositoryGrant.create({data:{repositoryId:repo.id,membershipId:membership.id}})
  await db.repositoryProfile.create({data:{repositoryId:repo.id,sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),branch:'main',fullName:repo.fullName,version:1,complete:true,report:{}}})
  await db.repositoryStandardsSelection.create({data:{repositoryId:repo.id,revision:1,profile:'RECOMMENDED',packs:[{id:'baseline-engineering',version:'1.0.0'}],selectedById:owner.identityId}})
})
const body=async()=>{const plan=await plans.get(owner,'51');return {requestKey:randomUUID(),expectedSourceSha:plan.sourceSha,expectedSelectionId:plan.selectionId,expectedPlanHash:plan.planHash,ruleIds:['secrets.scan']}}
it('durably records a scoped blocked attempt and audit, without queuing or gate data',async()=>{
  const response=await post(owner,root,await body()).expect(201)
  expect(response.body.state).toBe('BLOCKED');expect(response.body.reason).toBe('PREFLIGHT_DISABLED');expect(response.body).not.toHaveProperty('plan')
  expect(await db.nativeExecutionRequest.count()).toBe(1);expect(await db.auditEvent.count({where:{event:'native.execution.blocked'}})).toBe(1)
  expect(await db.commitAssessment.count()).toBe(0);expect(await db.gitHubCheckPublication.count()).toBe(0)
})
it('requires separate execution permission while allowing developers to read history',async()=>{
  const input=await body();await post(developer,root,input).expect(403);await get(developer).expect(200);expect(status.status).not.toHaveBeenCalled()
})
it('denies another organization and unauthenticated sessions',async()=>{
  await post(outsider,root,await body()).expect(403);await get(outsider).expect(403);await http(app.getHttpServer()).get(root).expect(401)
})
it('rejects CSRF, unknown commands and unsupported adapters',async()=>{
  const input=await body();await http(app.getHttpServer()).post(root).set('Cookie',`native.sid=${owner.identityId}`).set('Origin','https://attacker.invalid').send(input).expect(403)
  await post(owner,root,{...input,command:['/bin/sh']}).expect(400);await post(owner,root,{...input,ruleIds:['tests.required']}).expect(400)
  expect(await db.nativeExecutionRequest.count()).toBe(0)
})
it('pins source, standards and plan and rejects stale expected values',async()=>{
  for(const patch of [{expectedSourceSha:'c'.repeat(40)},{expectedSelectionId:'old'},{expectedPlanHash:'c'.repeat(64)}])await post(owner,root,{...await body(),...patch}).expect(409)
  expect(await db.nativeExecutionRequest.count()).toBe(0)
})
it('deduplicates concurrent requests and refuses reuse for another actor or input',async()=>{
  const input=await body();const results=await Promise.all([post(owner,root,input),post(owner,root,input)])
  expect(results.map(r=>r.status)).toEqual([201,201]);expect(results[0].body.id).toBe(results[1].body.id);expect(await db.nativeExecutionRequest.count()).toBe(1)
  await post(owner,root,{...input,expectedSourceSha:'c'.repeat(40)}).expect(409)
})
it('a successful preflight alone never queues or enables execution',async()=>{
  status.status.mockResolvedValue({preflightVerified:true,reason:'DISPATCHER_REQUIRED'})
  const response=await post(owner,root,await body()).expect(201);expect(response.body.state).toBe('BLOCKED');expect(response.body.reason).toBe('TOOL_REVIEW_REQUIRED')
})
it('returns paginated history and denies invalid pages',async()=>{
  for(let i=0;i<21;i++)await service.request(owner,'51',await body())
  const first=(await get().expect(200)).body, second=(await get(owner,root+'?page=2').expect(200)).body
  expect(first.items).toHaveLength(20);expect(second.items).toHaveLength(1);expect(first.total).toBe(21);expect(first.pages).toBe(2)
  await get(owner,root+'?page=0').expect(400);await get(owner,root+'?page=1.5').expect(400)
})
it('does not return historical data after deselection or membership revocation',async()=>{
  await service.request(owner,'51',await body());await db.gitHubRepository.update({where:{id:repo.id},data:{selected:false}});await get().expect(403)
  await db.gitHubRepository.update({where:{id:repo.id},data:{selected:true}});await db.organizationMembership.updateMany({where:{identityId:owner.identityId},data:{active:false}});await get().expect(403)
})
it('does not claim a running/preparing job is cancelled before cleanup acknowledgement',async()=>{
  const record=await service.request(owner,'51',await body());await db.nativeExecutionRequest.update({where:{id:record.id},data:{state:'RUNNING',controllerJobId:'sandbox-job',finishedAt:null}})
  const result=(await post(owner,root+'/'+record.id+'/cancel',{}).expect(201)).body;expect(result.state).toBe('CANCEL_REQUESTED');expect(result.finishedAt).toBeNull()
  await post(owner,root+'/'+record.id+'/cancel',{}).expect(201);expect(await db.auditEvent.count({where:{event:'native.execution.cancel_requested'}})).toBe(1)
})
it('cancels unstarted queued work durably and leaves blocked/terminal records unchanged',async()=>{
  const record=await service.request(owner,'51',await body());await db.nativeExecutionRequest.update({where:{id:record.id},data:{state:'QUEUED',finishedAt:null}})
  const result=(await post(owner,root+'/'+record.id+'/cancel',{}).expect(201)).body;expect(result.state).toBe('CANCELLED');expect(result.finishedAt).not.toBeNull()
  await post(developer,root+'/'+record.id+'/cancel',{}).expect(403);await post(outsider,root+'/'+record.id+'/cancel',{}).expect(403)
  await post(owner,root+'/'+randomUUID()+'/cancel',{}).expect(404)
})
it('detects altered plans before exposing or cancelling requests',async()=>{
  const record=await service.request(owner,'51',await body());await db.nativeExecutionRequest.update({where:{id:record.id},data:{plan:{tampered:true}}});await get().expect(409)
})
it('rechecks current source in the write transaction after preflight',async()=>{
  status.status.mockImplementationOnce(async()=>{await db.repositoryProfile.create({data:{repositoryId:repo.id,sourceSha:'c'.repeat(40),treeSha:'d'.repeat(40),branch:'main',fullName:repo.fullName,version:1,complete:true,report:{}}});return {preflightVerified:false,reason:'PREFLIGHT_DISABLED'}})
  await post(owner,root,await body()).expect(409);expect(await db.nativeExecutionRequest.count()).toBe(0)
})
