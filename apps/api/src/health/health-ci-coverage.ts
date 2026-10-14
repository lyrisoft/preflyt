import { ciLcov } from '../github-events/ci-lcov.js'
import { validateObservation, validateReport } from '../assessments/evidence-validation.js'
import { githubReportExecutions } from '../assessments/pipeline-verification.js'
import { runAttempt } from '../assessments/ci-binding.js'
import { validatedProvenance } from '../github-events/ci-attestation-policy.js'

export type CiCoverageMeasurement = { version: 1; formula: 'lcov-reported-lines-v1'; scope: 'ci-reported-files'; analyzedFiles: number; analyzedLines: number; coveredLines: number }
export function ciCoverageMeasurement(content: Uint8Array): CiCoverageMeasurement | undefined {
 try { return ciLcov(Buffer.from(content).toString('utf8')) } catch {return undefined}
}
export type HealthCiCoverage = { sourceSha: string | null; state: 'VERIFIED'|'MISSING'|'UNVERIFIED'; reason: string; runUrl?: string; receivedAt?: string; measurement?: CiCoverageMeasurement; tests?: {tests:number;passed:number;failures:number;errors:number;skipped:number}; testsState?: 'PASS'|'FAIL'|'INCOMPLETE'; artifactIds?: string[] }
/** Read-only evidence projection. Saved Health reports and deterministic gate results are never changed. */
export async function verifiedHealthCiCoverage(db: any, repo: {id:string;githubId:bigint;installationId:bigint;fullName:string}, sourceSha: string | null): Promise<HealthCiCoverage> {
 const missing:HealthCiCoverage={sourceSha,state:'MISSING',reason:'CI_COVERAGE_NOT_RECEIVED'}
 if(!sourceSha)return missing
 const observations=await db.importedCiEvidence.findMany({where:{repositoryGithubId:repo.githubId,installationId:repo.installationId,sourceSha,sourceKind:{in:['workflow_run','workflow_jobs']},sourceStatus:'completed'},orderBy:{observedAt:'desc'},take:31,include:{delivery:true,artifacts:{take:11,include:{attestations:{take:2,orderBy:{createdAt:'desc'}}}}}})
 if(observations.length>30)return {...missing,state:'UNVERIFIED',reason:'CI_EVIDENCE_LIMIT'}
 const audits=await db.auditEvent.findMany({where:{event:'pipeline.run.verified',AND:[{metadata:{path:['repositoryId'],equals:repo.id}},{metadata:{path:['sourceSha'],equals:sourceSha}}]},orderBy:{createdAt:'desc'},take:101,select:{metadata:true}})
 const receipts=audits.length<=100 ? audits.map((a:any)=>a.metadata).filter((m:any)=>m.schemaVersion===1&&m.repositoryId===repo.id&&m.sourceSha===sourceSha&&Array.isArray(m.reports)&&Array.isArray(m.jobIds)&&m.jobIds.length>0) : []
 let unverified:HealthCiCoverage|undefined
 const seenRuns=new Set<string>()
 for(const observation of observations){
  if(seenRuns.has(observation.sourceObjectId))continue
  seenRuns.add(observation.sourceObjectId)
  if(!validateObservation(observation,observation.delivery)||observation.artifacts.length>10)continue
  if(observation.artifacts.some((artifact:any)=>artifact.format==='lcov'))unverified??={...missing,state:'UNVERIFIED',reason:'CI_REPORT_UNVERIFIED',runUrl:`https://github.com/${repo.fullName}/actions/runs/${observation.sourceObjectId}/attempts/${runAttempt(observation.sourceIdentity)}`}
  const verified=observation.artifacts.flatMap((artifact:any)=>{
   const validation=validateReport(artifact)
   const proof=artifact.attestations.find((receipt:any)=>validatedProvenance(receipt,{artifactId:artifact.id,artifactSha256:artifact.sha256,repositoryId:repo.githubId.toString(),repositoryName:repo.fullName,sourceSha,runId:observation.sourceObjectId,runAttempt:runAttempt(observation.sourceIdentity)}))
   return validation.integrity==='VALID'&&proof ? [{artifact,executions:githubReportExecutions(receipts,observation,artifact.sha256)}] : []
  })
  // Do not attach unrelated JUnit artifacts (for example a build check) as unit test results.
  const tests=verified.filter((item:any)=>item.artifact.format==='junit'&&item.executions.some((e:any)=>e.ruleId==='tests.required'))
  const coverages=verified.filter((item:any)=>item.artifact.format==='lcov'&&item.executions.some((e:any)=>e.ruleId==='tests.coverage'))
  if(!tests.length&&!coverages.length)continue
  if(tests.length>1||coverages.length>1)return {...missing,state:'UNVERIFIED',reason:'CI_REPORTS_AMBIGUOUS'}
  const summary=tests[0]?.artifact.summary
  const measurement=coverages[0]&&ciCoverageMeasurement(coverages[0].artifact.content)
  const executed=summary&&summary.tests>0&&summary.passed+summary.failures+summary.errors>0
  return {...missing,state:measurement?'VERIFIED':'MISSING',reason:measurement?'CI_COVERAGE_VERIFIED':'CI_COVERAGE_NOT_RECEIVED',runUrl:`https://github.com/${repo.fullName}/actions/runs/${observation.sourceObjectId}/attempts/${runAttempt(observation.sourceIdentity)}`,receivedAt:observation.importedAt.toISOString(),...(measurement?{measurement}:{}),...(summary?{tests:{tests:summary.tests,passed:summary.passed,failures:summary.failures,errors:summary.errors,skipped:summary.skipped},testsState:executed ? summary.failures+summary.errors>0?'FAIL':summary.skipped>0?'INCOMPLETE':'PASS':'INCOMPLETE'}:{}),artifactIds:[...tests,...coverages].map((item:any)=>item.artifact.id)}
 }
 return unverified??missing
}
