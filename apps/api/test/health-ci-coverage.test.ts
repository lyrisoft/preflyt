import {createHash} from 'node:crypto'
import {expect,it,vi} from 'vitest'
import {parseArtifact} from '../src/github-events/ci-artifact-parser.js'
import {ciLcov} from '../src/github-events/ci-lcov.js'
import {normalizePipelineSubmission} from '../src/assessments/pipeline-submission.js'
import {verifiedHealthCiCoverage} from '../src/health/health-ci-coverage.js'
vi.mock('../src/assessments/evidence-validation.js',async original=>({...await original<typeof import('../src/assessments/evidence-validation.js')>(),validateObservation:vi.fn(()=>true)}))
vi.mock('../src/github-events/ci-attestation-policy.js',async original=>({...await original<typeof import('../src/github-events/ci-attestation-policy.js')>(),validatedProvenance:vi.fn(receipt=>receipt?.valid?{status:'VERIFIED_ATTESTATION'}:null)}))
const lcov='SF:src/app.js\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n',sha='a'.repeat(40)
const artifact=(format:string,content:string)=>{const hash=createHash('sha256').update(content).digest('hex'),parsed=parseArtifact(format,content,hash);return {id:format,format,sha256:hash,content:parsed.bytes,summary:parsed.summary,parserVersion:1,verification:'ADMIN_ASSOCIATED_UNVERIFIED',attestations:[{valid:true}]}}
const repo={id:'repo',githubId:51n,installationId:50n,fullName:'org/repo'}
function fixture(){
 const junit=artifact('junit','<testsuite tests="2"><testcase name="one"/><testcase name="two"/></testsuite>'),coverage=artifact('lcov',lcov)
 const observation={sourceSha:sha,sourceKind:'workflow_run',sourceStatus:'completed',sourceConclusion:'success',sourceObjectId:'12',sourceIdentity:{kind:'workflow_run',workflowId:'4',runAttempt:2},delivery:{},importedAt:new Date(),artifacts:[junit,coverage]}
 const metadata={schemaVersion:1,repositoryId:'repo',sourceSha:sha,runId:'12',runAttempt:2,workflowId:'4',jobIds:['7'],reports:[{ruleId:'tests.required',sha256:junit.sha256},{ruleId:'tests.coverage',sha256:coverage.sha256}]}
 const db={importedCiEvidence:{findMany:vi.fn(async()=>[observation])},auditEvent:{findMany:vi.fn(async()=>[{metadata}])}}
 return {db,observation,metadata,junit,coverage}
}
it('unions reported physical lines and rejects inconsistent or incomplete coverage',()=>{
 expect(ciLcov(lcov+lcov)).toMatchObject({analyzedFiles:1,analyzedLines:2,coveredLines:1})
 for(const raw of [lcov.replace('LF:2','LF:3'),lcov.replace('LH:1','LH:2'),lcov.replace('end_of_record',''),lcov.replace('src/app.js','../outside.js'),lcov.replace('DA:2,0','DA:1,0')])expect(()=>ciLcov(raw)).toThrow()
})
it('accepts optional coverage evidence without adding a requirement or changing a verdict',()=>{
 const policy={id:'p',definitionHash:'b'.repeat(64),repositoryId:'51',sourceSha:sha,headSha:sha,checks:[{id:'tests.required',title:'Tests',required:true}]}
 const body={schemaVersion:1,policyId:'p',policyHash:policy.definitionHash,repositoryId:'51',sourceSha:sha,headSha:sha,results:[{ruleId:'tests.required',status:'passed'}],reports:[{ruleId:'tests.coverage',format:'lcov',content:lcov,sha256:createHash('sha256').update(lcov).digest('hex')}]}
 expect(normalizePipelineSubmission(body,policy)).toMatchObject({result:'passed',results:[{ruleId:'tests.required'}],reports:[{ruleId:'tests.coverage',format:'lcov'}]})
 expect(()=>normalizePipelineSubmission({...body,results:[{ruleId:'tests.coverage',status:'passed'}]},policy)).toThrow()
})
it('projects signed integrity-checked reports for the exact commit and run attempt',async()=>{
 const {db}=fixture(),result=await verifiedHealthCiCoverage(db,repo,sha)
 expect(result).toMatchObject({state:'VERIFIED',sourceSha:sha,testsState:'PASS',tests:{tests:2,passed:2},measurement:{analyzedLines:2,coveredLines:1},runUrl:'https://github.com/org/repo/actions/runs/12/attempts/2'})
 expect(db.importedCiEvidence.findMany.mock.calls[0][0].where).toMatchObject({sourceSha:sha,repositoryGithubId:51n,installationId:50n})
})
it('withholds unsigned, corrupted, unverified and wrong-attempt coverage',async()=>{
 for(const change of ['proof','content','execution','attempt']){
  const {db,coverage,metadata}=fixture()
  if(change==='proof')coverage.attestations=[{valid:false}]
  if(change==='content')coverage.content=Buffer.from(lcov+'invalid')
  if(change==='execution')metadata.reports=metadata.reports.filter(r=>r.ruleId!=='tests.coverage')
  if(change==='attempt')metadata.runAttempt=1
  expect((await verifiedHealthCiCoverage(db,repo,sha)).measurement).toBeUndefined()
 }
})
it('does not count zero tests or skipped tests as passing and leaves missing coverage unavailable',async()=>{
 const {db,observation,metadata}=fixture(),junit=artifact('junit','<testsuite tests="1" skipped="1"><testcase name="one"><skipped/></testcase></testsuite>')
 observation.artifacts=[junit];metadata.reports=[{ruleId:'tests.required',sha256:junit.sha256}]
 expect(await verifiedHealthCiCoverage(db,repo,sha)).toMatchObject({state:'MISSING',testsState:'INCOMPLETE',tests:{passed:0,skipped:1}})
 expect(await verifiedHealthCiCoverage(db,repo,null)).toMatchObject({state:'MISSING',sourceSha:null})
})
it('preserves reported failed tests independently of coverage and never calls them passed',async()=>{
 const {db,observation,metadata}=fixture(),junit=artifact('junit','<testsuite tests="2" failures="1"><testcase name="one"/><testcase name="two"><failure/></testcase></testsuite>')
 observation.artifacts[0]=junit;metadata.reports[0].sha256=junit.sha256
 expect(await verifiedHealthCiCoverage(db,repo,sha)).toMatchObject({state:'VERIFIED',testsState:'FAIL',tests:{passed:1,failures:1},measurement:{coveredLines:1}})
})
it('never substitutes an older successful attempt after a newer failed attempt of the same run',async()=>{
 const {db,observation,metadata}=fixture()
 const older={...observation,sourceIdentity:{...observation.sourceIdentity,runAttempt:1}}
 observation.sourceConclusion='failure';metadata.runAttempt=1
 db.importedCiEvidence.findMany.mockResolvedValue([observation,older])
 expect((await verifiedHealthCiCoverage(db,repo,sha)).measurement).toBeUndefined()
})

it('accepts unsigned coverage only with the same server-verified GitHub execution receipt used by policy checks',async()=>{
 const {db,coverage}=fixture();coverage.attestations=[]
 expect(await verifiedHealthCiCoverage(db,repo,sha)).toMatchObject({state:'VERIFIED',measurement:{analyzedLines:2,coveredLines:1}})
 db.auditEvent.findMany.mockResolvedValue([])
 expect((await verifiedHealthCiCoverage(db,repo,sha)).measurement).toBeUndefined()
})
it('retains explicit organization-key proof requirements and rejects unknown proof modes',async()=>{
 for(const mode of ['organization-key','unknown']){
  vi.stubEnv('CI_REPORT_PROOF_MODE',mode)
  try { const {db,coverage}=fixture();coverage.attestations=[]
   expect((await verifiedHealthCiCoverage(db,repo,sha)).measurement).toBeUndefined()
  } finally {vi.unstubAllEnvs()}
 }
})

it('decodes bounded compressed LCOV without changing its original digest or policy result',async()=>{
 const {gzipSync}=await import('node:zlib')
 const policy={id:'p',definitionHash:'b'.repeat(64),repositoryId:'51',sourceSha:sha,headSha:sha,checks:[{id:'tests.required',title:'Tests',required:true}]}
 const report={ruleId:'tests.coverage',format:'lcov',encoding:'gzip-base64',content:gzipSync(lcov).toString('base64'),sha256:createHash('sha256').update(lcov).digest('hex')}
 const body={schemaVersion:1,policyId:'p',policyHash:policy.definitionHash,repositoryId:'51',sourceSha:sha,headSha:sha,results:[{ruleId:'tests.required',status:'passed'}],reports:[report]}
 expect(normalizePipelineSubmission(body,policy)).toMatchObject({result:'passed',reports:[{format:'lcov',content:lcov,sha256:report.sha256}]})
 for(const patch of [{sha256:'0'.repeat(64)},{encoding:'unknown'},{content:'not base64'},{content:Buffer.from('invalid gzip').toString('base64')},{content:gzipSync('x'.repeat(2*1024*1024+1)).toString('base64')},{ruleId:'tests.required',format:'junit'}])
  expect(()=>normalizePipelineSubmission({...body,reports:[{...report,...patch}]},policy)).toThrow()
})
