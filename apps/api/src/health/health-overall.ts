import type { HealthReport } from './health-report.js'
export type OverallHealth = {
 version: 1; status: 'HEALTHY'|'NEEDS_ATTENTION'|'UNHEALTHY'|'INCOMPLETE'|'NOT_ASSESSED'|'QUEUED'|'RUNNING'; reasons: string[]
}
/** Deterministic latest-report summary. Missing results are never averaged into a pass. */
export function overallHealth(report: HealthReport|null|undefined, state: string): OverallHealth {
 const result=(status:OverallHealth['status'],reasons:string[]):OverallHealth=>({version:1,status,reasons})
 if(state==='NOT_ASSESSED') return result('NOT_ASSESSED',['No saved assessment.'])
 if(state==='QUEUED'||state==='RUNNING') return result(state,['Assessment is still in progress.'])
 if(!report) return result('INCOMPLETE',['No usable analysis report.'])
 const rules=report.policyContext?.healthRules??[]
 const knownFailures:string[]=[]
 if(report.findings.some(f=>!f.suppressed&&['critical','high'].includes(f.severity))) knownFailures.push('Critical or high findings reported.')
 for(const rule of rules.filter(rule=>rule.required)) {
  const failures=report.analyses.filter(a=>a.id===rule.id&&a.state==='FAIL').length
  if(failures>rule.maxFailedChecks) knownFailures.push(`Required ${rule.id} analysis failed its policy limit.`)
 }
 // A known failure takes precedence even when another analysis is missing.
 if(knownFailures.length) return result('UNHEALTHY',knownFailures)
 const missing:string[]=[]
 if(report.selection && report.selection !== 'all') missing.push('Only the selected category was assessed. Repository-wide readiness is incomplete.')
 if(state!=='COMPLETED') missing.push('Assessment did not complete successfully.')
 if(report.mode!=='EXECUTED'||!report.inspection.complete||!report.analyses.length||report.completeness!=='COMPLETE') missing.push('Applicable repository analysis is incomplete.')
 if(report.policyContext?.state==='POLICY_INVALID') missing.push('Captured policy could not be verified.')
 for(const a of report.analyses) {
  if(!['PASS','FAIL'].includes(a.state)||a.findingsRetained===undefined||a.findingsReported===undefined||a.findingsReported!==a.findingsRetained) missing.push(`${a.title??a.id}: analysis results are incomplete.`)
 }
 for(const rule of rules.filter(rule=>rule.required)) if(!report.analyses.some(a=>a.id===rule.id&&['PASS','FAIL'].includes(a.state))) missing.push(`Required ${rule.id} analysis is missing.`)
 if(missing.length) return result('INCOMPLETE',[...new Set(missing)])
 if(report.findings.some(f=>!f.suppressed)||report.analyses.some(a=>a.state==='FAIL')) return result('NEEDS_ATTENTION',['Advisory findings or failed advisory analyses need attention.'])
 return result('HEALTHY',['All applicable analyses meet their recorded requirements.'])
}
