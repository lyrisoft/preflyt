import type { NativeSourceBundle } from '../execution/native-source.js'
import type { HealthFinding } from './health-report.js'

export const paymentDomains = ['discovery','application_security','payment_security','financial_integrity','infrastructure','data_compliance','fraud_abuse','risk_reporting'] as const
export const paymentScenarios = ['provider_timeout_retry','duplicate_webhooks','concurrent_payouts','status_manipulation','amount_manipulation','partial_failure'] as const
export const paymentAreas = ['money_movement','ledger','payout','refund','settlement','reconciliation','fx'] as const
export const paymentTimeframes = ['immediate','7_days','30_days','long_term'] as const
export type PaymentReference = {path:string;startLine:number;endLine:number}
export type PaymentOutcome = {outcome:'reviewed'|'needs_follow_up'|'not_applicable';reason:string;issueIds:string[];references:PaymentReference[]}
export type PaymentRiskReport = {
 version:1;profile:'payment-risk-v1';executiveSummary:string
 systemInventory:Array<{service:string;description:string;references:PaymentReference[]}>
 findings:Array<{issueId:string;category:string;service:string;function:string;classification:'LIKELY'|'POTENTIAL';likelihood:number;impact:number;score:number;severity:'critical'|'high'|'medium'|'low';title:string;attackScenario:string;references:PaymentReference[];reasoning:string;impactDescription:string;remediation:string;preconditions:string;counterevidence:string}>
 domains:Array<PaymentOutcome & {domain:string}>
 paymentRiskRegister:Array<PaymentOutcome & {area:string}>
 attackScenarios:Array<PaymentOutcome & {scenario:string}>
 remediationPlan:Array<{timeframe:string;actions:string;issueIds:string[]}>
 qaRegressionCases:Array<{issueId:string;test:string}>
 finalRiskSummary:{summary:string;topIssueIds:string[];immediateActions:string}
}
const invalid = ():never => {throw new Error('PAYMENT_RISK_REPORT_INVALID')}
const object = (v:unknown):Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : invalid()
const list = (v:unknown,max=50):unknown[] => Array.isArray(v) && v.length<=max ? v : invalid()
const text = (v:unknown):string => typeof v==='string' && v.trim() && v.length<=6000 && !/-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(v) ? v.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim() : invalid()

/** Defense in depth after the runner's observed-read validation. IDs become stable finding fingerprints. */
export function paymentRiskReport(value:unknown,source:NativeSourceBundle,issues:Map<string,HealthFinding>):PaymentRiskReport {
 if(Buffer.byteLength(JSON.stringify(value)??'')>240000)invalid()
 const raw=object(value)
 if(raw.version!==1 || raw.profile!=='payment-risk-v1')invalid()
 const files=new Map(source.files.map(f=>[f.path,Buffer.from(f.content,'base64').toString('utf8').split('\n').length]))
 const ids=(v:unknown)=>{const values=list(v).map(id=>typeof id==='string' && issues.has(id)?id:invalid());if(new Set(values).size!==values.length)invalid();return values.map(id=>issues.get(id)!.fingerprint)}
 const references=(v:unknown,required=false):PaymentReference[]=>{
  const rows=list(v,10).map(value=>{const r=object(value);const path=r.path,startLine=r.startLine,endLine=r.endLine
   if(Object.keys(r).sort().join(',')!=='endLine,path,startLine' || typeof path!=='string' || !files.has(path) || !Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || Number(startLine)<1 || Number(endLine)<Number(startLine) || Number(endLine)>files.get(path)! || Number(endLine)-Number(startLine)>119)invalid()
   return {path:path as string,startLine:Number(startLine),endLine:Number(endLine)}
  });if(required&&!rows.length)invalid();return rows
 }
 const exact=(v:unknown,key:string,expected:readonly string[])=>{const rows=list(v).map(object),keys=rows.map(r=>r[key]);if(rows.length!==expected.length||new Set(keys).size!==keys.length||keys.some(k=>!expected.includes(k as string)))invalid();return rows}
 const outcomes=(v:unknown,key:string,expected:readonly string[])=>exact(v,key,expected).map(r=>{
  if(!['reviewed','needs_follow_up','not_applicable'].includes(r.outcome as string))invalid()
  return {[key]:r[key] as string,outcome:r.outcome as PaymentOutcome['outcome'],reason:text(r.reason),issueIds:ids(r.issueIds),references:references(r.references,r.outcome!=='needs_follow_up')}
 })
 const inventory=list(raw.systemInventory,40).map(object).map(r=>({service:text(r.service),description:text(r.description),references:references(r.references,true)}))
 if(!inventory.length)invalid()
 const entries=exact(raw.findings,'issueId',[...issues.keys()]).map(r=>{
  if(!['LIKELY','POTENTIAL'].includes(r.classification as string)||!paymentDomains.includes(r.category as typeof paymentDomains[number]))invalid()
  const likelihood=r.likelihood,impact=r.impact
  if(!Number.isInteger(likelihood)||!Number.isInteger(impact)||Number(likelihood)<1||Number(likelihood)>5||Number(impact)<1||Number(impact)>5)invalid()
  const score=Number(likelihood)*Number(impact),severity=score>=20?'critical':score>=12?'high':score>=6?'medium':'low'
  const issue=issues.get(r.issueId as string)!
  if(!issue.aiReview || !issue.path || !issue.line)invalid()
  return {title:issue.title,references:[{path:issue.path!,startLine:issue.line!,endLine:issue.endLine??issue.line!}],reasoning:issue.aiReview!.reasoning,impactDescription:issue.aiReview!.impact,remediation:issue.aiReview!.remediation,preconditions:issue.aiReview!.preconditions,counterevidence:issue.aiReview!.counterevidence,issueId:issue.fingerprint,category:r.category as string,service:text(r.service),function:text(r.function),classification:r.classification as 'LIKELY'|'POTENTIAL',likelihood:Number(likelihood),impact:Number(impact),score,severity,attackScenario:text(r.attackScenario)}
 })
 const cases=exact(raw.qaRegressionCases,'issueId',[...issues.keys()]).map(r=>({issueId:issues.get(r.issueId as string)!.fingerprint,test:text(r.test)}))
 const final=object(raw.finalRiskSummary),top=ids(final.topIssueIds)
 if(top.length>10)invalid()
 return {version:1,profile:'payment-risk-v1',executiveSummary:text(raw.executiveSummary),systemInventory:inventory,findings:entries as PaymentRiskReport['findings'],
  domains:outcomes(raw.domains,'domain',paymentDomains) as PaymentRiskReport['domains'],paymentRiskRegister:outcomes(raw.paymentRiskRegister,'area',paymentAreas) as PaymentRiskReport['paymentRiskRegister'],attackScenarios:outcomes(raw.attackScenarios,'scenario',paymentScenarios) as PaymentRiskReport['attackScenarios'],
  remediationPlan:exact(raw.remediationPlan,'timeframe',paymentTimeframes).map(r=>({timeframe:r.timeframe as string,actions:text(r.actions),issueIds:ids(r.issueIds)})),qaRegressionCases:cases,finalRiskSummary:{summary:text(final.summary),topIssueIds:[...entries].sort((a,b)=>b.score-a.score || a.issueId.localeCompare(b.issueId)).slice(0,10).map(f=>f.issueId),immediateActions:text(final.immediateActions)}}
}
