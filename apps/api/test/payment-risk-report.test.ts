import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { strixReport } from '../src/health/strix-report.js'
import { paymentRiskReport } from '../src/health/payment-risk-report.js'
import type { NativeSourceBundle } from '../src/execution/native-source.js'
const fixture=()=>JSON.parse(readFileSync(new URL('../../../tools/strix-runner/fixtures/payment-risk-v1.json',import.meta.url),'utf8'))
const source={sourceHash:'a'.repeat(64),files:[{path:'payments.py',content:Buffer.from('def pay():\n    transfer()\n').toString('base64')}]} as NativeSourceBundle
const issue={id:'issue-1',title:'Missing payout ownership check',severity:'low',review_status:'NEEDS_REVIEW',code_locations:[{file:'payments.py',start_line:1,end_line:2}],source_analysis:{reasoning:'The handler passes a supplied merchant to transfer without an ownership comparison.',impact:'Another merchant may lose funds.',remediation:'Bind the merchant to the authenticated caller before transfer.',preconditions:'An authenticated caller can reach the handler.',verification_steps:'Check two merchant identities.',counterevidence:'An inherited guard may enforce ownership; inspect it before confirming.'}}
const result={version:1 as const,assessmentId:'fixture',sourceHash:source.sourceHash,state:'COMPLETED' as const,toolVersion:'1.7.0',cleanupConfirmed:true,findings:[issue]}
it('imports a structured report and links scored entries to real Needs review findings',()=>{
 const report=strixReport({...result,paymentRiskReport:fixture()},source,0,'payment-risk-v1')
 const finding=report.findings[0]!
 expect(finding).toMatchObject({evidence:'AI_REPORTED',severity:'critical',aiReview:{status:'NEEDS_REVIEW'}})
 expect(report.paymentRiskReport?.findings[0]).toMatchObject({issueId:finding.fingerprint,score:20,classification:'LIKELY'})
 expect(report.paymentRiskReport?.qaRegressionCases[0]?.issueId).toBe(finding.fingerprint)
 expect(finding.aiReview?.verificationSteps).toContain('unchanged balances')
 expect(report.paymentRiskSummary).toEqual({profile:'payment-risk-v1',findings:1})
 expect(report.completeness).toBe('PARTIAL')
})
it('cannot finish a payment profile without the required structured report',()=>{
 expect(()=>strixReport(result,source,0,'payment-risk-v1')).toThrow('PAYMENT_RISK_REPORT_INCOMPLETE')
 expect(()=>strixReport({...result,state:'FAILED'},source,0,'payment-risk-v1')).not.toThrow()
 expect(()=>strixReport(result,source,0)).not.toThrow()
})
it('rejects incomplete reports, fabricated source locations and unverified confirmed findings',()=>{
 const valid=strixReport(result,source,0),issues=new Map([['issue-1',valid.findings[0]!]])
 for(const change of [
  (r:any)=>r.attackScenarios.pop(),
  (r:any)=>r.domains.pop(),
  (r:any)=>r.paymentRiskRegister.pop(),
  (r:any)=>r.remediationPlan.pop(),
  (r:any)=>r.qaRegressionCases.pop(),
  (r:any)=>r.findings[0].classification='CONFIRMED',
  (r:any)=>r.findings[0].likelihood=true,
  (r:any)=>r.findings[0].impact=6,
  (r:any)=>r.systemInventory[0].references[0].path='../private',
  (r:any)=>r.systemInventory[0].references[0].endLine=999,
  (r:any)=>r.attackScenarios[0].issueIds=['invented'],
  (r:any)=>r.executiveSummary='password: secret-value',
 ]){const raw=fixture();change(raw);expect(()=>paymentRiskReport(raw,source,issues)).toThrow('PAYMENT_RISK_REPORT_INVALID')}
 const raw=fixture();raw.findings[0].score=1;raw.findings[0].severity='low'
 expect(paymentRiskReport(raw,source,issues).findings[0]).toMatchObject({score:20,severity:'critical'})
})

it('combines both scopes in one report and imports a repeated source issue only once',()=>{
 const report=strixReport({...result,findings:[issue,{...issue}],paymentRiskReport:fixture()},source,0,'general-and-payment-risk-v1')
 expect(report.findings).toHaveLength(1)
 expect(report.paymentRiskReport?.findings).toHaveLength(1)
 expect(report.paymentRiskReport?.findings[0]?.issueId).toBe(report.findings[0]?.fingerprint)
 expect(()=>strixReport(result,source,0,'general-and-payment-risk-v1')).toThrow('PAYMENT_RISK_REPORT_INCOMPLETE')
})
