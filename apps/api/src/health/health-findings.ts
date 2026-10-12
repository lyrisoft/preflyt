import { normalizeReportFindings, type ReportFinding } from '../findings/normalize-report-findings.js'
export function validHealthRuleGuidance(value: unknown): boolean {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const guide=value as Record<string,unknown>
 return guide.version===1 && guide.source==='ANALYZER_REPORT' &&
  Object.keys(guide).every(key=>['version','source','explanation','advice'].includes(key)) &&
  ['explanation','advice'].some(key=>typeof guide[key]==='string') &&
  ['explanation','advice'].every(key=>!(key in guide) || typeof guide[key]==='string' && (guide[key] as string).trim().length>0 && (guide[key] as string).length<=500 &&
   !/[\x00-\x08\x0b-\x1f\x7f]/.test(guide[key] as string) &&
   !/-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(guide[key] as string))
}
export function validHealthFindings(value: unknown): value is ReportFinding[] {
 return Array.isArray(value) && value.length <= 20 && value.every(f => f && typeof f === 'object' &&
  Object.keys(f).filter(k => k !== 'endLine' && k !== 'relatedLocations' && k !== 'reportGuidance').sort().join(',') === 'category,fingerprint,line,path,ruleId,severity,suppressed,title' &&
  (!('reportGuidance' in f) || validHealthRuleGuidance(f.reportGuidance)) &&
  (!('relatedLocations' in f) || f.category==='duplication' && Array.isArray(f.relatedLocations) && f.relatedLocations.length<=3 && f.relatedLocations.every((l:any)=>
   l && Object.keys(l).sort().join(',')==='endLine,line,path' && typeof l.path==='string' && l.path.length>0 && l.path.length<=500 &&
   !/^[\\/]|^[a-z]+:|[\\?#%\x00-\x1f]/i.test(l.path) && !l.path.split('/').some((p:string)=>['..','.',''].includes(p)) &&
   Number.isSafeInteger(l.line) && l.line>0 && Number.isSafeInteger(l.endLine) && l.endLine>=l.line && l.endLine<=1000000)) &&
  /^[a-f0-9]{64}$/.test(f.fingerprint) && ['security', 'reliability', 'maintainability', 'duplication', 'hotspot'].includes(f.category) && ['critical','high','medium','low','unknown'].includes(f.severity) &&
  typeof f.title === 'string' && f.title.length <= 200 && !/[\x00-\x1f\x7f]/.test(f.title) &&
  !/-----BEGIN|Bearer\s|sk-[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(f.title) &&
  (f.ruleId === null || typeof f.ruleId === 'string' && f.ruleId.length <= 120 && !/[\x00-\x1f]/.test(f.ruleId)) &&
  (f.path === null || typeof f.path === 'string' && f.path.length <= 500 && !/^[\\/]|^[a-z]+:|[\\?#\x00-\x1f]/i.test(f.path) && !f.path.split('/').some((p: string) => ['..','.',''].includes(p)) && !/%/.test(f.path)) &&
  (f.line === null || Number.isSafeInteger(f.line) && f.line > 0 && f.line <= 1000000) && (!('endLine' in f) || f.endLine === null || Number.isSafeInteger(f.endLine) && f.line !== null && f.endLine >= f.line && f.endLine <= 1000000) && typeof f.suppressed === 'boolean')
}
export function healthReceiptFindings(report: string | null | undefined, hash: string | null, secret: boolean, category: 'security' | 'reliability' | 'maintainability' | 'duplication' | 'hotspot' = 'security'): ReportFinding[] | undefined {
 if (!report || !hash || report.length > 350000) return undefined
 try {
  const rows = normalizeReportFindings('sarif', Buffer.from(report, 'base64'), hash).map(({reportGuidance, relatedLocations, ...f}) => ({ ...f,
   ...(!secret && reportGuidance ? {reportGuidance:{...reportGuidance,...(reportGuidance.explanation?{explanation:reportGuidance.explanation.slice(0,500)}:{}),...(reportGuidance.advice?{advice:reportGuidance.advice.slice(0,500)}:{})}} : {}),
   ...(!secret && category==='duplication' && relatedLocations?.length ? {relatedLocations} : {}),
   category, title: secret ? 'Potential secret detected; sensitive details hidden' : f.title.slice(0,200), ruleId: f.ruleId?.slice(0,120) ?? null,
  })).filter(f => validHealthFindings([f]))
  const priority:Record<string,number>={critical:4,high:3,medium:2,low:1,unknown:0}
  rows.sort((a,b)=>priority[b.severity]-priority[a.severity]||a.fingerprint.localeCompare(b.fingerprint))
  // Keep messages and payload safely below the signed receipt's 40KB bound.
  const retained: ReportFinding[] = []
  for (const row of rows.slice(0,20)) { if (Buffer.byteLength(JSON.stringify([...retained,row])) > 5000) break; retained.push(row) }
  return retained
 } catch { return undefined }
}
