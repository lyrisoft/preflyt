import { HEALTH_REPORT_BYTES, HEALTH_REPORT_BASE64 } from './health-report-limits.js'
import {createHash} from 'node:crypto'
export const fileAnalysisRules=['security.sast','quality.reliability','quality.maintainability','security.hotspots']
export type FileAnalysis = {version:1;formula:'semgrep-candidate-files-v1';scope:'js-ts-python';candidateFiles:number;analyzedFiles:number;skippedFiles:number;pathsDigest:string}
export function validFileAnalysis(value:unknown):value is FileAnalysis {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return Object.keys(v).sort().join(',')==='analyzedFiles,candidateFiles,formula,pathsDigest,scope,skippedFiles,version'&&v.version===1&&v.formula==='semgrep-candidate-files-v1'&&v.scope==='js-ts-python'&&
  ['candidateFiles','analyzedFiles','skippedFiles'].every(key=>Number.isSafeInteger(v[key])&&Number(v[key])>=0&&Number(v[key])<=8000)&&Number(v.analyzedFiles)+Number(v.skippedFiles)===v.candidateFiles&&typeof v.pathsDigest==='string'&&/^[a-f0-9]{64}$/.test(v.pathsDigest)
}
export function fileAnalysisMeasurement(report:string|null|undefined,hash:string|null):FileAnalysis|undefined {
 if(!report||!hash||report.length>HEALTH_REPORT_BASE64)return undefined
 try {
  const bytes=Buffer.from(report,'base64');if(bytes.length>HEALTH_REPORT_BYTES||createHash('sha256').update(bytes).digest('hex')!==hash)return undefined
  const value=JSON.parse(bytes.toString('utf8'))
  if(value.version!=='2.1.0'||value.runs?.length!==1||!/^Semgrep(?: OSS| CE)?$/.test(value.runs[0].tool?.driver?.name??''))return undefined
  const measurement=value.runs[0].properties?.preflytFileAnalysis
  return validFileAnalysis(measurement)?measurement:undefined
 }catch{return undefined}
}

export function fileAnalysisFailureReason(report:string|null|undefined,hash:string|null):'FILE_ANALYSIS_SCAN_ERRORS'|undefined {
 if(!report||!hash||report.length>HEALTH_REPORT_BASE64)return undefined
 try{const bytes=Buffer.from(report,'base64');if(bytes.length>HEALTH_REPORT_BYTES||createHash('sha256').update(bytes).digest('hex')!==hash)return undefined
 const s=JSON.parse(bytes.toString('utf8'));return s.version==='2.1.0'&&s.runs?.length===1&&/^Semgrep(?: OSS| CE)?$/.test(s.runs[0].tool?.driver?.name??'')&&s.runs[0].properties?.preflytFileAnalysisUnavailable==='SCAN_ERRORS'?'FILE_ANALYSIS_SCAN_ERRORS':undefined
 }catch{return undefined}
}

export type ScanError = {type:string;path:string|null;line?:number}
export function validScanErrors(value:unknown): value is ScanError[] {
 return Array.isArray(value) && value.length<=30 && value.every(v=>v && Object.keys(v).filter(k=>k!=='line').sort().join(',')==='path,type' && (!('line' in v) || v.path!==null && Number.isSafeInteger(v.line) && v.line>0 && v.line<=1000000) &&
  typeof v.type==='string' && /^[A-Za-z][A-Za-z0-9 _-]{0,79}$/.test(v.type) && (v.path===null || typeof v.path==='string' && v.path.length<=500 &&
  !/^[\\/]|^[a-z]+:|[\\?#%\x00-\x1f]/i.test(v.path) && !v.path.split('/').some((p:string)=>['','.','..'].includes(p))))
}
export function fileAnalysisErrors(report:string|null|undefined,hash:string|null): ScanError[]|undefined {
 if(!report||!hash||report.length>HEALTH_REPORT_BASE64)return undefined
 try {const bytes=Buffer.from(report,'base64');if(bytes.length>HEALTH_REPORT_BYTES||createHash('sha256').update(bytes).digest('hex')!==hash)return undefined
 const value=JSON.parse(bytes.toString('utf8')),errors=value.runs?.[0]?.properties?.preflytScanErrors
 return value.version==='2.1.0'&&value.runs?.length===1&&validScanErrors(errors)?errors:undefined
 }catch{return undefined}
}
