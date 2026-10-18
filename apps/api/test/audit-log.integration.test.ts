import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import http from 'supertest';
import { disposableDatabase } from './disposable-database.js';
import { AuditLogService, auditFilters } from '../src/audit/audit-log.service.js';
import { AuditLogController } from '../src/audit/audit-log.controller.js';
import { AuthorizationService } from '../src/auth/authorization.service.js';
import { SessionGuard, type AuthenticatedSession } from '../src/auth/session.guard.js';
import { AuthService } from '../src/auth/auth.service.js';
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, service: AuditLogService, app: Awaited<ReturnType<typeof NestFactory.create>>;
const actors: Record<string, AuthenticatedSession> = {};
let org: string, other: string, memberId: string;
const get = (actor='owner', query={}) => http(app.getHttpServer()).get('/audit-log').set('Cookie', `sid=${actor}`).query(query);
beforeAll(async () => {
 fixture = await disposableDatabase('audit'); const db=fixture.prisma;
 org=(await db.organization.create({data:{name:'Workspace A'}})).id;
 other=(await db.organization.create({data:{name:'Workspace B'}})).id;
 for(const role of ['OWNER','ADMIN','AUDITOR','DEVELOPER']) {
 const identity=await db.identity.create({data:{issuer:'fixture',subject:role,displayName:role === 'OWNER' ? 'Test owner' : role}});
 const membership=await db.organizationMembership.create({data:{organizationId:org,identityId:identity.id,role:role as 'OWNER'}});
 if(role==='AUDITOR') memberId=membership.id;
 actors[role.toLowerCase()]={authenticated:true,identityId:identity.id,subject:role,email:null,role,organizationId:org};
 }
 await db.organizationMembership.create({data:{organizationId:other,identityId:actors.owner.identityId,role:'OWNER'}});
 for(const [id,organizationId] of [[1n,org],[2n,other]] as const) await db.gitHubInstallation.create({data:{id,organizationId,accountLogin:'fixture',accountType:'Organization',repositorySelection:'all',permissions:{},connectedById:actors.owner.identityId}});
 for(const [id,githubId,installationId] of [['repo-a',101n,1n],['repo-b',102n,1n],['repo-foreign',201n,2n]] as const) await db.gitHubRepository.create({data:{id,githubId,installationId,name:id,fullName:'fixture/'+id,ownerLogin:'fixture',isPrivate:true,selected:true}});
 await db.repositoryGrant.create({data:{membershipId:memberId,repositoryId:'repo-a'}});
 await db.gitHubRulesetDeployment.create({data:{id:'legacy-deploy',repositoryId:'repo-a',organizationId:org,draftId:'draft',draftHash:'hash',definition:{},definitionHash:'hash',preview:{},previewHash:'hash',proposedById:actors.owner.identityId,governanceAppId:'1',governanceInstallationId:'1'}});
 await db.auditEvent.createMany({data:[
 ...Array.from({length:25},(_,i)=>({id:`page-${String(i).padStart(2,'0')}`,event:'policy.published',actorId:actors.owner.identityId,createdAt:new Date('2026-10-10T12:00:00Z'),metadata:{repositoryId:'repo-a',branchRef:'refs/heads/main',apiKey:'DO-NOT-EXPOSE',privateKey:'SECRET'}})),
 {id:'legacy',event:'github.ruleset_activation_verified',metadata:{deploymentId:'legacy-deploy'},createdAt:new Date('2026-10-11T23:59:59Z')},
 {id:'workspace',event:'organization.settings.updated',metadata:{organizationId:org},createdAt:new Date('2026-10-09T00:00:00Z')},
 {id:'restricted',event:'assessment.created',metadata:{repositoryId:'repo-b'},createdAt:new Date('2026-10-10T00:00:00Z')},
 {id:'foreign',event:'policy.published',actorId:actors.owner.identityId,metadata:{repositoryId:'repo-foreign'},createdAt:new Date('2026-10-10T00:00:00Z')},
 {id:'conflicting',event:'policy.published',metadata:{organizationId:org,repositoryId:'repo-foreign'}},
 {id:'orphan',event:'ai.review.finished',metadata:{organizationId:org,reviewId:'deleted-review'}},
 {id:'unscoped',event:'super_admin_login_succeeded',actorId:actors.owner.identityId,metadata:{}},
 ]});
 const access=new AuthorizationService(db);service=new AuditLogService(db,access);
 app=await NestFactory.create({module:class TestModule{},controllers:[AuditLogController],providers:[SessionGuard,{provide:AuthorizationService,useValue:access},{provide:AuditLogService,useValue:service},{provide:AuthService,useValue:{sessionCookieName:'sid',currentSession:async (token:string)=>actors[token] ?? {authenticated:false}}}]},{logger:false});
 app.use(cookieParser());await app.init();
},60000);
afterAll(async()=>{await app?.close();await fixture?.close()});
it('paginates older records deterministically, resolves legacy resources and shows named actors without raw metadata',async()=>{
 const first=(await get().expect(200)).body, second=(await get('owner',{page:'2',pageSize:'25'}).expect(200)).body;
 expect(first.total).toBe(28);expect(first.items).toHaveLength(10);expect(second.items).toHaveLength(3);expect(second.hasMore).toBe(false);
 const full=(await get('owner',{pageSize:'25'}).expect(200)).body;expect(full.items).toHaveLength(25);expect(new Set([...full.items,...second.items].map(i=>i.id)).size).toBe(28);
 expect(first.items[0]).toMatchObject({id:'legacy',actionLabel:'Ruleset activation verified',repository:{id:'101',name:'fixture/repo-a'},actor:{name:'Automated system'},createdAt:'2026-10-11T23:59:59.000Z'});
 expect(first.items[1]).toMatchObject({id:'page-24',actor:{name:'Test owner'},details:[{label:'Branch',value:'refs/heads/main'}]});
 expect(JSON.stringify(first)).not.toContain('DO-NOT-EXPOSE');expect(JSON.stringify(first)).not.toContain('metadata');
 expect((await get('admin').expect(200)).body.total).toBe(28);
});
it('filters action, repository and full inclusive UTC days and rejects invalid filters',async()=>{
 expect((await get('owner',{from:'2026-10-11',to:'2026-10-11'}).expect(200)).body.items.map(i=>i.id)).toEqual(['legacy']);
 expect((await get('owner',{action:'policy.published',repository:'101'}).expect(200)).body.total).toBe(25);
 expect((await get('owner',{action:'not.recorded'}).expect(200)).body.total).toBe(0);
 for(const query of [{page:'0'},{page:'1.5'},{repository:'x'},{from:'2026-02-30'},{from:'2026-10-11',to:'2026-10-10'},{action:"x'; DROP TABLE"}]) await get('owner',query).expect(400);
 expect(()=>auditFilters({action:['a','b']})).toThrow();
});
it('preserves reference precedence, workspace conflicts and orphan filtering in rows, counts and action choices', async()=>{
 const db=fixture.prisma, day='2026-10-13';
 const records=[
  ['github-id',{repositoryGithubId:'101'},true],
  ['github-alias',{githubRepositoryId:'101'},true],
  ['empty-alias',{repositoryGithubId:'',repositoryId:'repo-a'},true],
  ['installation',{installationId:'1'},true],
  ['legacy-empty-workspace',{organizationId:'',deploymentId:'legacy-deploy'},true],
  ['conflicting-workspace',{organizationId:other,repositoryId:'repo-a'},false],
  ['conflicting-installation',{organizationId:org,installationId:'2'},false],
  ['foreign-alias-first',{repositoryGithubId:'201',repositoryId:'repo-a'},false],
  ['missing-alias-first',{repositoryGithubId:'999',repositoryId:'repo-a'},false],
  ['missing-reference',{organizationId:org,assessmentId:'deleted'},false],
  ['unknown-repository',{organizationId:org,repositoryId:'deleted'},false],
  ['unscoped',{},false],
 ] as const;
 try {
  await db.auditEvent.createMany({data:records.map(([id,metadata])=>({id:'scope-'+id,event:'scope.'+id,metadata,createdAt:new Date(day+'T12:00:00Z')}))});
  const result=(await get('owner',{from:day,to:day,pageSize:'50'}).expect(200)).body;
  const expected=records.filter(([, ,visible])=>visible).map(([id])=>'scope-'+id).sort();
  expect(result.items.map(i=>i.id).sort()).toEqual(expected);
  expect(result.total).toBe(expected.length);
  expect(result.actions.filter(a=>a.id.startsWith('scope.')).map(a=>a.id).sort()).toEqual(expected.map(id=>id.replace('scope-','scope.')).sort());
  const absent=(await get('owner',{from:day,to:day,page:'2',pageSize:'50'}).expect(200)).body;
  expect(absent.items).toEqual([]);expect(absent.total).toBe(expected.length);expect(absent.hasMore).toBe(false);
  const filtered=(await get('owner',{from:day,to:day,repository:'101'}).expect(200)).body;
  expect(filtered.total).toBe(expected.length-1); // Installation-only event remains workspace-level.
 } finally {await db.auditEvent.deleteMany({where:{id:{startsWith:'scope-'}}})}
});

it('immediately hides legacy rows and their action choices when the source or repository becomes unavailable',async()=>{
 const db=fixture.prisma;
 try {
  await db.gitHubRulesetDeployment.create({data:{id:'removed-source',repositoryId:'repo-a',organizationId:org,draftId:'draft',draftHash:'hash',definition:{},definitionHash:'hash',preview:{},previewHash:'hash',proposedById:actors.owner.identityId,governanceAppId:'1',governanceInstallationId:'1'}});
  await db.auditEvent.create({data:{id:'scope-deletion',event:'scope.deleted',metadata:{deploymentId:'removed-source'}}});
  expect((await get('owner',{action:'scope.deleted'}).expect(200)).body.total).toBe(1);
  await db.gitHubRulesetDeployment.delete({where:{id:'removed-source'}});
  const removed=(await get('owner',{action:'scope.deleted'}).expect(200)).body;
  expect(removed.total).toBe(0);expect(removed.items).toEqual([]);expect(removed.actions.map(a=>a.id)).not.toContain('scope.deleted');
  await db.gitHubRepository.update({where:{id:'repo-a'},data:{available:false}});
  const unavailable=(await get('owner',{action:'policy.published'}).expect(200)).body;
  expect(unavailable.total).toBe(0);expect(unavailable.actions.map(a=>a.id)).not.toContain('policy.published');
 } finally {
  await db.gitHubRepository.update({where:{id:'repo-a'},data:{available:true}});
  await db.auditEvent.deleteMany({where:{id:'scope-deletion'}});
  await db.gitHubRulesetDeployment.deleteMany({where:{id:'removed-source'}});
 }
});

it('does not duplicate matching internal/GitHub IDs or expose an ID collision in another workspace',async()=>{
 const db=fixture.prisma;
 try {
  await db.gitHubRepository.createMany({data:[
   {id:'909',githubId:909n,installationId:1n,name:'numeric',fullName:'fixture/numeric',ownerLogin:'fixture',isPrivate:true,selected:true},
   {id:'101',githubId:301n,installationId:2n,name:'collision',fullName:'foreign/collision',ownerLogin:'fixture',isPrivate:true,selected:true},
  ]});
  await db.auditEvent.createMany({data:[
   {id:'scope-numeric',event:'scope.numeric',metadata:{repositoryId:'909'}},
   {id:'scope-collision',event:'scope.collision',metadata:{repositoryId:'101'}},
  ]});
  const numeric=(await get('owner',{action:'scope.numeric'}).expect(200)).body;
  expect(numeric.total).toBe(1);expect(numeric.items[0].repository).toEqual({id:'909',name:'fixture/numeric'});
  const collision=(await get('owner',{action:'scope.collision'}).expect(200)).body;
  expect(collision.total).toBe(1);expect(collision.items[0].repository).toEqual({id:'101',name:'fixture/repo-a'});
 } finally {
  await db.auditEvent.deleteMany({where:{id:{in:['scope-numeric','scope-collision']}}});
  await db.gitHubRepository.deleteMany({where:{id:{in:['909','101']}}});
 }
});

it('honors current GitHub repository access evidence for rows, totals and action choices',async()=>{
 let ids=[101n];
 const github={repositoryIds:async()=>ids};
 const scopedService=new AuditLogService(fixture.prisma,new AuthorizationService(fixture.prisma,github as never));
 const result=await scopedService.list(actors.owner,{from:'2026-10-10',to:'2026-10-11'});
 expect(result.total).toBe(26);expect(result.items.every(i=>i.repository?.id==='101')).toBe(true);
 expect(result.repositories.map(r=>r.id)).toEqual(['101']);expect(result.actions.map(a=>a.id)).not.toContain('assessment.created');
 ids=[];
 const revoked=await scopedService.list(actors.owner,{from:'2026-10-10',to:'2026-10-11'});
 expect(revoked.total).toBe(0);expect(revoked.items).toEqual([]);expect(revoked.actions.map(a=>a.id)).not.toContain('policy.published');
 await expect(scopedService.list(actors.owner,{repository:'101'})).rejects.toThrow('Repository audit history is not available to you');
});

it('limits Auditors to granted repositories and denies foreign repositories and unauthorized roles',async()=>{
 const result=(await get('auditor').expect(200)).body;
 expect(result.total).toBe(27);expect(result.repositories.map(r=>r.id)).toEqual(['101']);
 expect(result.actions.map(a=>a.id)).not.toContain('assessment.created');
 await get('auditor',{repository:'102'}).expect(403);await get('owner',{repository:'201'}).expect(403);
 await get('developer').expect(403);await get('anonymous').expect(401);
 await fixture.prisma.repositoryGrant.deleteMany({where:{membershipId:memberId}});
 const revoked=(await get('auditor').expect(200)).body;
 expect(revoked.items.map(i=>i.id)).toContain('workspace');expect(revoked.items.every(i=>i.repository === null)).toBe(true);expect(revoked.items.every(i=>['organization.settings.updated','authorization_denied'].includes(i.action))).toBe(true);expect(revoked.repositories).toEqual([]);
});

it('requires current active workspace membership even for a Super Admin session', async()=>{ actors.owner.platformAdmin=true; await fixture.prisma.organizationMembership.updateMany({where:{identityId:actors.owner.identityId,organizationId:org},data:{active:false}});await get('owner').expect(403);expect((await get('admin').expect(200)).body.items.every(i=>i.repository?.id !== '201')).toBe(true) });
