import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest'
import { disposableDatabase } from './disposable-database.js'
import { FindingsService } from '../src/findings/findings.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { findingIgnoreId, ignoreState, validateIgnore } from '../src/findings/finding-ignore.js'
import { summarizeFindings } from '../src/findings/findings-summary.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, session: any, service: FindingsService, row: any
beforeAll(async () => { fixture = await disposableDatabase('ignore') })
afterAll(async () => { await fixture?.close() })
beforeEach(async () => {
 await fixture.reset()
 const db=fixture.prisma, org=await db.organization.create({data:{name:'Ignore fixture'}}), identity=await db.identity.create({data:{issuer:'fixture',subject:'owner'}})
 await db.organizationMembership.create({data:{identityId:identity.id,organizationId:org.id,role:'OWNER'}})
 session={authenticated:true,identityId:identity.id,organizationId:org.id,subject:'owner',role:'OWNER',email:null}
 await db.gitHubInstallation.create({data:{id:1n,connectedById:identity.id,organizationId:org.id,accountLogin:'fixture',accountType:'Organization',repositorySelection:'selected',permissions:{}}})
 await db.gitHubRepository.create({data:{githubId:11n,installationId:1n,name:'repo',fullName:'fixture/repo',ownerLogin:'fixture',isPrivate:true,selected:true}})
 row={repositoryId:'11',origin:'health',category:'duplication',ruleId:'duplicates',path:'src/a.ts',line:4,endLine:8,title:'Repeated code',sourceSha:'a'.repeat(40),assessmentId:'first',status:'Reported',severity:'low'}
 service=new FindingsService(db,new AuthorizationService(db),{} as any)
 vi.spyOn(service as any,'ignoreFinding').mockImplementation(async()=>row)
})
it('persists across scans, audits ignore/reopen, excludes ignored metrics and keeps saved results unchanged',async()=>{
 await service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Intentional duplication',expectedRevision:0})
 row={...row,sourceSha:'b'.repeat(40),assessmentId:'second'}
 const decision=await service.getIgnore(session,'f'.repeat(64),{})
 expect(decision).toMatchObject({state:'IGNORED',revision:1,reason:'Intentional duplication'})
 expect(decision.history).toHaveLength(1)
 const rows=[{...row}];await (service as any).applyIgnores(session,rows)
 expect(rows[0].status).toBe('Ignored');expect(row.status).toBe('Reported')
 expect(summarizeFindings(rows,'findings')).toMatchObject({reportedIssues:0,ignored:1})
 await service.setIgnore(session,'f'.repeat(64),{}, {state:'OPEN',reason:'Review again',expectedRevision:1})
 expect(await service.getIgnore(session,'f'.repeat(64),{})).toMatchObject({state:'OPEN',revision:2})
 expect(await fixture.prisma.auditEvent.count()).toBe(2)
})
it('expires automatically without a worker and remains reopenable',async()=>{
 const expiresAt=new Date(Date.now()+3600000)
 await service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Temporary exception',expiresAt:expiresAt.toISOString(),expectedRevision:0})
 const saved=await fixture.prisma.findingIgnore.findFirstOrThrow()
 expect(ignoreState(saved,new Date(expiresAt.getTime()+1))).toMatchObject({state:'OPEN',expired:true,revision:1})
})
it('rejects stale updates, missing reasons, past expiry and ignoring missing evidence',async()=>{
 for(const patch of [{reason:''},{reason:' '},{expiresAt:'invalid'},{expiresAt:'2020-01-01'},{expectedRevision:-1}])
  await expect(service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Reviewed',expectedRevision:0,...patch})).rejects.toThrow()
 await service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Reviewed',expectedRevision:0})
 await expect(service.setIgnore(session,'f'.repeat(64),{}, {state:'OPEN',reason:'Reopen',expectedRevision:0})).rejects.toThrow('changed')
 row.category='evidence'
 await expect(service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Reviewed',expectedRevision:0})).rejects.toThrow('cannot be ignored')
 expect(await fixture.prisma.auditEvent.count()).toBe(1)
})
it('denies revoked repository access and other organizations without writing decisions',async()=>{
 await fixture.prisma.gitHubRepository.updateMany({data:{selected:false}})
 await expect(service.setIgnore(session,'f'.repeat(64),{}, {state:'IGNORED',reason:'Reviewed',expectedRevision:0})).rejects.toThrow()
 await expect(service.getIgnore({...session,organizationId:'other'},'f'.repeat(64),{})).rejects.toThrow()
 expect(await fixture.prisma.findingIgnore.count()).toBe(0)
})
it('does not carry ignores into other repositories, sources, rules or changed locations',()=>{
 const key=findingIgnoreId('org',row)
 expect(findingIgnoreId('org',{...row,sourceSha:'new',assessmentId:'new'})).toBe(key)
 for(const patch of [{repositoryId:'12'},{origin:'ci'},{ruleId:'other'},{path:'src/b.ts'},{line:5},{title:'Different defect'}]) expect(findingIgnoreId('org',{...row,...patch})).not.toBe(key)
 expect(findingIgnoreId('other',row)).not.toBe(key)
 expect(()=>validateIgnore({state:'OPEN',reason:'',expectedRevision:1})).toThrow()
})
it('looks up Health findings from authorized saved reports and applies ignores to the paginated list',async()=>{
 vi.restoreAllMocks()
 const db=fixture.prisma, repo=await db.gitHubRepository.findFirstOrThrow(), fingerprint='f'.repeat(64)
 const saved=await db.repositoryHealthAssessment.create({data:{repositoryId:repo.id,organizationId:session.organizationId,branch:'main',targetRevision:1,requestKey:'fixture',actorId:session.identityId,state:'COMPLETED',sourceSha:row.sourceSha,report:{completeness:'COMPLETE',findings:[{...row,fingerprint}]}}})
 const query={origin:'health',repository:'11',assessment:saved.id}
 await service.setIgnore(session,fingerprint,query,{state:'IGNORED',reason:'Known duplication',expectedRevision:0})
 const result=await service.list(session,{source:'health',repository:'11',triage:'IGNORED'})
 expect(result.rows).toHaveLength(1)
 expect(result.rows[0].status).toBe('Ignored')
 expect(result.summary).toMatchObject({reportedIssues:0,ignored:1})
 await expect(service.getIgnore(session,'a'.repeat(64),query)).rejects.toThrow('unavailable')
 expect((await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:saved.id}})).report).toEqual({completeness:'COMPLETE',findings:[{...row,fingerprint}]})
})
