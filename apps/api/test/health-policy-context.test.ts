import {expect,it,vi} from 'vitest'
import {digest} from '../src/assessments/assessment-digest.js'
import {captureHealthPolicy,healthPolicyContext} from '../src/health/health-policy-context.js'
const sha='a'.repeat(40),selectionId='selection',branch='development'
const definition={branchRef:'refs/heads/development',selectionId,rules:[{id:'ci.configured',required:true}]}
const policy={id:'policy',state:'PUBLISHED',revision:2,branchRef:definition.branchRef,selectionId,definition,definitionHash:digest(definition)}
function snapshot(){const s:any={id:'ci-assessment',sourceSha:sha,selectionId,request:{sourceSha:sha,selectionId,profileSnapshot:{sourceSha:sha,complete:true}},plan:{version:1,sourceSha:sha,enforcement:'observe',mode:'INGEST_ONLY',stage:'ci',checks:[{id:'ci.configured',required:true,operator:'configuration_hint_present',capability:'available'}]},report:{version:1,sourceSha:sha,collectionTruncated:false,validationCollectionTruncated:false,checks:[{ruleId:'ci.configured',title:'CI',required:true,coverage:'CONFIGURATION_OBSERVED',configurationEvidence:[{path:'.github/workflows/ci.yml',blobSha:'c'.repeat(40)}]}]}};s.assessmentHash=digest({request:s.request,plan:s.plan,report:s.report});return s}
it('keeps missing or altered policies unavailable rather than passing',()=>{
 expect(captureHealthPolicy(null,null,sha,branch)).toMatchObject({state:'NO_PUBLISHED_POLICY',evidence:{percentage:null}})
 for(const patch of [{branchRef:'refs/heads/main'},{state:'DRAFT'},{definitionHash:'f'.repeat(64)}]) expect(captureHealthPolicy({...policy,...patch},null,sha,branch).state).toBe('POLICY_INVALID')
})
it('uses only matching integrity-checked historical evidence and preserves its actual scope',()=>{
 expect(captureHealthPolicy(policy,snapshot(),sha,branch)).toMatchObject({state:'CAPTURED',revision:2,requirements:1,evidence:{state:'HISTORICAL_PREVIEW',assessmentId:'ci-assessment',covered:1,passing:1,percentage:100}})
 for(const patch of [{sourceSha:'b'.repeat(40)},{selectionId:'other'},{assessmentHash:'f'.repeat(64)}]) expect(captureHealthPolicy(policy,{...snapshot(),...patch},sha,branch).evidence.state).toBe('UNAVAILABLE')
 const s=snapshot();s.report.collectionTruncated=true;s.assessmentHash=digest({request:s.request,plan:s.plan,report:s.report})
 expect(captureHealthPolicy(policy,s,sha,branch).evidence).toMatchObject({covered:0,incomplete:1,percentage:0})
})
it('reads only the authorized repository, organization, branch and resolved revision',async()=>{
 const db={gatePolicyRevision:{findFirst:vi.fn().mockResolvedValue(policy)},commitAssessment:{findFirst:vi.fn().mockResolvedValue(snapshot())}}
 await healthPolicyContext(db,'repository','organization',sha,branch)
 expect(db.gatePolicyRevision.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{repositoryId:'repository',organizationId:'organization',branchRef:'refs/heads/development',state:'PUBLISHED'}}))
 expect(db.commitAssessment.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{repositoryId:'repository',sourceSha:sha,selectionId}}))
})

it('captures supported Health required flags and failed-check limits with the saved policy',()=>{
 const definition={branchRef:'refs/heads/development',selectionId,rules:[{id:'quality.duplication',required:true,thresholds:{maxFailedChecks:0}},{id:'tests.coverage',required:true,thresholds:{maxFailedChecks:0}},{id:'unrelated.check',required:true}]}
 const saved=captureHealthPolicy({...policy,definition,definitionHash:digest(definition)},null,sha,branch)
 expect(saved.healthRules).toEqual([{id:'quality.duplication',required:true,maxFailedChecks:0},{id:'tests.coverage',required:true,maxFailedChecks:0}])
})
