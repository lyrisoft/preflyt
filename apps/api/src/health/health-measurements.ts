import { HEALTH_REPORT_BYTES, HEALTH_REPORT_BASE64 } from './health-report-limits.js'
import { createHash } from 'node:crypto'
export type DuplicationMeasurement = {
 version: 1; kind: 'duplication'; formula: 'unique-lines-v1';
 analyzedLines: number; duplicatedLines: number; analyzedFiles: number; clonePairs: number;
 minimumLines: 5; minimumTokens: 50; mode: 'weak';
}
export function validDuplicationMeasurement(value: unknown): value is DuplicationMeasurement {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const v=value as Record<string,unknown>
 return Object.keys(v).sort().join(',') === 'analyzedFiles,analyzedLines,clonePairs,duplicatedLines,formula,kind,minimumLines,minimumTokens,mode,version' &&
  v.version===1 && v.kind==='duplication' && v.formula==='unique-lines-v1' && v.minimumLines===5 && v.minimumTokens===50 && v.mode==='weak' &&
  ['analyzedLines','duplicatedLines','analyzedFiles','clonePairs'].every(k=>Number.isSafeInteger(v[k]) && Number(v[k])>=0 && Number(v[k])<=50000000) &&
  Number(v.duplicatedLines)<=Number(v.analyzedLines) && Number(v.analyzedFiles)<=Number(v.analyzedLines) &&
  (Number(v.analyzedLines)===0 ? v.analyzedFiles===0 : Number(v.analyzedFiles)>0) &&
  (Number(v.clonePairs)===0 ? v.duplicatedLines===0 : Number(v.duplicatedLines)>0)
}
/** Extract only the fixed wrapper's measured counters; never trust percentages or source fragments. */
export function duplicationMeasurement(report: string | null | undefined, hash: string | null): DuplicationMeasurement | undefined {
 if (!report || !hash || report.length>HEALTH_REPORT_BASE64) return undefined
 try {
  const bytes=Buffer.from(report,'base64')
  if(bytes.length>HEALTH_REPORT_BYTES || createHash('sha256').update(bytes).digest('hex')!==hash) return undefined
  const sarif=JSON.parse(bytes.toString('utf8'))
  if(sarif.version!=='2.1.0' || sarif.runs?.length!==1 || sarif.runs[0].tool?.driver?.name!=='Preflyt duplication') return undefined
  const value=sarif.runs[0].properties?.preflytMeasurement
  return validDuplicationMeasurement(value)?value:undefined
 } catch {return undefined}
}
export type CoverageMeasurement={
 version:1;kind:'coverage';formula:'node-covered-lines-v1';scope:'node-loaded-files';
 analyzedLines:number;coveredLines:number;analyzedFiles:number;tests:number;passed:number;failed:0;skipped:0;cancelled:0;todo:0;
}
export type HealthMeasurement=DuplicationMeasurement|CoverageMeasurement
export function validCoverageMeasurement(value:unknown):value is CoverageMeasurement {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return Object.keys(v).sort().join(',')==='analyzedFiles,analyzedLines,cancelled,coveredLines,failed,formula,kind,passed,scope,skipped,tests,todo,version'&&
  v.version===1&&v.kind==='coverage'&&v.formula==='node-covered-lines-v1'&&v.scope==='node-loaded-files'&&
  ['analyzedLines','coveredLines','analyzedFiles','tests','passed'].every(k=>Number.isSafeInteger(v[k])&&Number(v[k])>=0&&Number(v[k])<=50000000)&&
  Number(v.analyzedLines)>0&&Number(v.analyzedFiles)>0&&Number(v.analyzedFiles)<=Number(v.analyzedLines)&&Number(v.coveredLines)<=Number(v.analyzedLines)&&
  Number(v.tests)>0&&v.tests===v.passed&&v.failed===0&&v.skipped===0&&v.cancelled===0&&v.todo===0
}
export function coverageMeasurement(report:string|null|undefined,hash:string|null):CoverageMeasurement|undefined {
 if(!report||!hash||report.length>HEALTH_REPORT_BASE64)return undefined
 try {
  const bytes=Buffer.from(report,'base64')
  if(bytes.length>HEALTH_REPORT_BYTES||createHash('sha256').update(bytes).digest('hex')!==hash)return undefined
  const sarif=JSON.parse(bytes.toString('utf8'))
  if(sarif.version!=='2.1.0'||sarif.runs?.length!==1||sarif.runs[0].tool?.driver?.name!=='Preflyt test coverage'||sarif.runs[0].results?.length!==0)return undefined
  const value=sarif.runs[0].properties?.preflytMeasurement
  return validCoverageMeasurement(value)?value:undefined
 }catch{return undefined}
}

export function coverageFailureReason(report:string|null|undefined,hash:string|null):string|undefined {
 if(!report||!hash||report.length>HEALTH_REPORT_BASE64)return undefined
 try {
  const bytes=Buffer.from(report,'base64')
  if(bytes.length>HEALTH_REPORT_BYTES||createHash('sha256').update(bytes).digest('hex')!==hash)return undefined
  const sarif=JSON.parse(bytes.toString('utf8'))
  const run=sarif.version==='2.1.0'&&sarif.runs?.length===1?sarif.runs[0]:null
  const reason=run?.tool?.driver?.name==='Preflyt test coverage'?run.properties?.preflytCoverageUnavailable:null
  return ['SUPPORTED_TESTS_REQUIRED','TESTS_FAILED','TESTS_CANCELLED','TESTS_SKIPPED','NO_TESTS_EXECUTED','NO_SOURCE_COVERAGE','TEST_SCOPE_LIMIT','TEST_RUNNER_FAILED'].includes(reason)?reason:undefined
 }catch{return undefined}
}
