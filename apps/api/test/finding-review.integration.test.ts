import { RepositoryHealthService } from '../src/health/repository-health.service.js'
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
import { disposableDatabase } from './disposable-database.js'
import { FindingsService } from '../src/findings/findings.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import { findingReviewId, validateFindingReview } from '../src/findings/finding-review.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>, session:any, service:FindingsService, row:any, query:any
const id='f'.repeat(64)
beforeAll(async()=>{fixture=await disposableDatabase('review')})
afterAll(async()=>{await fixture?.close()})
beforeEach(async()=>{
 await fixture.reset()
 const db=fixture.prisma, org=await db.organization.create({data:{name:'Review fixture'}}), identity=await db.identity.create({data:{issuer:'fixture',subject:'reviewer'}})
 await db.organizationMembership.create({data:{identityId:identity.id,organizationId:org.id,role:'OWNER'}})
 session={authenticated:true,identityId:identity.id,organizationId:org.id,subject:'reviewer',role:'OWNER',email:null}
 await db.gitHubInstallation.create({data:{id:1n,connectedById:identity.id,organizationId:org.id,accountLogin:'fixture',accountType:'Organization',repositorySelection:'selected',permissions:{}}})
 const repo=await db.gitHubRepository.create({data:{githubId:11n,installationId:1n,name:'repo',fullName:'fixture/repo',ownerLogin:'fixture',isPrivate:true,selected:true}})
 row={fingerprint:id,category:'security',ruleId:'payment-risk',path:'src/pay.ts',line:4,endLine:8,title:'Potential payment mismatch',severity:'high',evidence:'AI_REPORTED'}
 const assessment=await db.repositoryHealthAssessment.create({data:{repositoryId:repo.id,organizationId:org.id,branch:'main',targetRevision:1,requestKey:'fixture',actorId:identity.id,state:'COMPLETED',sourceSha:'a'.repeat(40),report:{findings:[row]}}})
 query={origin:'health',repository:'11',assessment:assessment.id}
 service=new FindingsService(db,new AuthorizationService(db),{} as any)
})
it('records all human classifications, optimistic revisions and immutable evidence',async()=>{
 for(const [revision,classification] of ['POTENTIAL','LIKELY','CONFIRMED','FALSE_POSITIVE'].entries()){
  await service.setReview(session,id,query,{classification,reason:'Independent fixture source and regression evidence',expectedRevision:revision})
  expect(await service.getReview(session,id,query)).toMatchObject({classification,revision:revision+1})
 }
 const saved=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:query.assessment}})
 expect(saved.report).toEqual({findings:[row]})
 expect(await fixture.prisma.findingIgnore.count()).toBe(0)
 expect(await fixture.prisma.findingDisposition.count()).toBe(0)
 expect((await service.getReview(session,id,query)).history).toHaveLength(4)
 await expect(service.setReview(session,id,query,{classification:'LIKELY',reason:'Stale',expectedRevision:0})).rejects.toThrow('changed')
})
it('requires real evidence and rejects unsupported classifications and check results',async()=>{
 for(const patch of [{classification:'PASS'},{reason:''},{reason:' '},{reason:'x'.repeat(4001)},{expectedRevision:-1},{expectedRevision:1.1}])
  expect(()=>validateFindingReview({classification:'CONFIRMED',reason:'Evidence',expectedRevision:0,...patch})).toThrow()
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:query.assessment},data:{report:{findings:[{...row,category:'evidence'}]}}})
 await expect(service.setReview(session,id,query,{classification:'FALSE_POSITIVE',reason:'Not a vulnerability',expectedRevision:0})).rejects.toThrow('cannot be classified')
})
it('cannot cross repository, organization, membership or source revision boundaries',async()=>{
 const decision={classification:'CONFIRMED',reason:'Independently checked source and tests',expectedRevision:0}
 await service.setReview(session,id,query,decision)
 await expect(service.getReview({...session,organizationId:'another'},id,query)).rejects.toThrow()
 await expect(service.setReview(session,id,{...query,repository:'99'},decision)).rejects.toThrow()
 await fixture.prisma.organizationMembership.updateMany({where:{identityId:session.identityId},data:{role:'VIEWER'}})
 await expect(service.setReview({...session,role:'OWNER'},id,query,{...decision,expectedRevision:1})).rejects.toThrow()
 const base={id,repositoryId:'11',assessmentId:query.assessment,sourceSha:'a'.repeat(40),origin:'health'}
 for(const change of [{sourceSha:'b'.repeat(40)},{assessmentId:'other'},{repositoryId:'22'},{origin:'ai'}])
  expect(findingReviewId(session.organizationId,base)).not.toBe(findingReviewId(session.organizationId,{...base,...change}))
})
it('overlays current decisions on a page without altering the saved status or hiding findings',async()=>{
 await service.setReview(session,id,query,{classification:'FALSE_POSITIVE',reason:'Fixture payment guard rules out the issue',expectedRevision:0})
 const rows=[{...row,id:'e'.repeat(64),healthFingerprint:id,repositoryId:'11',assessmentId:query.assessment,sourceSha:'a'.repeat(40),origin:'health',status:'Needs review'}]
 await (service as any).applyReviews(session,rows)
 expect(rows[0].review).toMatchObject({classification:'FALSE_POSITIVE'})
 expect(rows[0].review).not.toHaveProperty('reason')
 expect(rows[0].status).toBe('Needs review')
 rows[0].sourceSha='b'.repeat(40)
 await (service as any).applyReviews(session,rows)
 expect(rows[0].review).toBeNull()
})

it('payment report reads overlay human decisions without rewriting model conclusions or source JSON',async()=>{
 const report={findings:[{issueId:id,classification:'LIKELY'}]}
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:query.assessment},data:{report:{findings:[row],paymentRiskReport:report}}})
 await service.setReview(session,id,query,{classification:'FALSE_POSITIVE',reason:'Independent guard inspection rules out the attack',expectedRevision:0})
 const health=new RepositoryHealthService(fixture.prisma,new AuthorizationService(fixture.prisma),{} as any,{} as any,{} as any)
 const result=await health.paymentRiskReport(session,'11',query.assessment)
 expect(result.report.findings[0]).toMatchObject({classification:'FALSE_POSITIVE',modelClassification:'LIKELY',review:{reason:'Independent guard inspection rules out the attack'}})
 const saved=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:query.assessment}})
 expect((saved.report as any).paymentRiskReport).toEqual(report)
 expect((await health.findingDetail(session,'11',query.assessment,id)).review).toMatchObject({classification:'FALSE_POSITIVE'})
 const page=await health.findings(session,'11',query.assessment,{})
 expect(page.rows[0].review).toMatchObject({classification:'FALSE_POSITIVE'})
 expect(page.rows[0].review).not.toHaveProperty('reason')
 await expect(health.paymentRiskReport({...session,organizationId:'other'},'11',query.assessment)).rejects.toThrow()
})

it('maps the review route to its explicit service authorization checks',async()=>{
 const access=new AuthorizationService(fixture.prisma)
 for(const method of ['GET','POST'])
  expect(await access.authorizeRequest({path:`/findings/${id}/review`,method} as any,session)).toBe(false)
 await expect(access.authorizeRequest({path:`/findings/${id}/unknown`,method:'POST'} as any,session)).rejects.toThrow()
})
