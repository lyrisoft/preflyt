import type { PaymentRiskReport } from './payment-risk-report.js'
import {type ScanError, validFileAnalysis, fileAnalysisRules, type FileAnalysis} from './health-file-analysis.js'
import { healthAnalysisComplete } from './health-analysis-completion.js'
import type { HealthPolicyContext } from './health-policy-context.js'
import { findingGuidance, type FindingGuidance, type FindingReferenceGuidance } from './finding-guidance.js'
import { validDuplicationMeasurement, validCoverageMeasurement, type HealthTestResult, type CoverageMeasurement, type DuplicationMeasurement } from './health-measurements.js'
import { digest } from '../assessments/assessment-digest.js'
import type { RepositorySnapshot } from '../github/repository-profile.js'
import type { NativeReceiptCheck } from '../execution/native-receipt.js'
import type { ReportFinding } from '../findings/normalize-report-findings.js'
export const healthAnalyses = [
 { id: 'secrets.scan', title: 'Secret detection', category: 'security', scope: 'Gitleaks patterns in the checked-out revision; detection is limited to the approved rule configuration.' },
 { id: 'security.sast', title: 'Static security analysis', category: 'security', scope: 'JavaScript, TypeScript and Python only: the Preflyt v2 rules check eval and exec calls and direct Python f-string SQL execution. Other vulnerability classes are not covered by this rule pack.' },
 { id: 'security.dependencies', title: 'Dependency vulnerabilities', category: 'security', scope: 'Recognized dependency manifests and lockfiles, using the approved offline vulnerability database. Unknown or unresolvable dependencies are outside the measured scope.' },
 { id: 'iac.policy', title: 'Infrastructure configuration', category: 'security', scope: 'Terraform and detected Kubernetes or Helm files, using the approved Trivy configuration checks; deployed infrastructure is not tested.' },
 { id: 'quality.reliability', title: 'Reliability', category: 'reliability', scope: 'JavaScript and TypeScript NaN comparisons and async Promise executors, and Python bare except handlers and returns in finally. These Preflyt v2 rules do not measure overall application reliability.' },
 { id: 'quality.maintainability', title: 'Maintainability', category: 'maintainability', scope: 'JavaScript and TypeScript debugger statements, nested ternaries and redundant catch-and-rethrow blocks; Python exec calls, mutable defaults, wildcard imports and redundant except-and-reraise blocks. These seven Preflyt v3 rules cover specific maintainability patterns, not an overall quality score.' },
 { id: 'quality.duplication', title: 'Duplicated code', category: 'duplication', scope: 'JavaScript, TypeScript, Python, Java, Go, Ruby, PHP, C#, CSS, SCSS, SQL and Rust token blocks of at least 5 lines and 50 tokens; dependencies, build output, generated folders, type declarations, minified JavaScript and oversized files are omitted.' },
 { id: 'security.hotspots', title: 'Security hotspot review', category: 'hotspot', scope: 'JavaScript and TypeScript createHash("md5") and Python hashlib.md5 calls. Other security-sensitive patterns are not covered by this Preflyt v1 pack.' },
 { id: 'tests.coverage', title: 'Test coverage', category: 'coverage', scope: 'Existing Vitest, Jest or Node test commands across configured packages. Coverage follows repository test configuration and excludes files absent from the measured reports.' },
] as const
export type VaptAnalysis = {version:1; status:'NEEDS_REVIEW'; reasoning:string; impact:string; remediation:string; preconditions:string; verificationSteps:string; counterevidence:string}
export type HealthFinding = ReportFinding & { aiReview?:VaptAnalysis; checkId: string; evidence: 'ANALYZER_REPORTED' | 'AI_REPORTED'; guidance?: FindingGuidance; referenceGuidance?: FindingReferenceGuidance }
export type SourceReviewCoverage = {
 version: 1; scope: 'SOURCE_ONLY'; evidence: 'AI_REPORTED'; available: boolean; truncated: boolean;
 entries: Array<{surface: string; riskArea: string; outcome: 'reported' | 'no_issue_found' | 'ruled_out' | 'not_applicable' | 'needs_follow_up'}>;
 gaps: Array<{surface: string; riskArea: string; detail: string}>;
 caveats: string[];
}
export type HealthReport = {
 paymentRiskReport?: PaymentRiskReport;
 paymentRiskSummary?: {profile:'payment-risk-v1';findings:number};
 findingSummary?: { total: number; unsuppressed: number; analyzerHigh: number; groups: Array<{category: string | null; checkId: string | null; severity?: string | null; count: number}> };
 sourceReviewCoverage?: SourceReviewCoverage;
 selection?: 'all' | 'security' | 'reliability' | 'maintainability' | 'duplication' | 'coverage';
 findingComparison?: { version: 1; key: string; checkIds: string[] };
 policyContext?: HealthPolicyContext;
 version: 1; completeness: 'COMPLETE' | 'PARTIAL'; mode: 'INSPECTION_ONLY' | 'EXECUTED';
 comparisonKey: string; inspection: { complete: boolean; fileCount: number; languages: string[] };
 analyses: Array<{ testResults?: HealthTestResult[]; scanErrors?: ScanError[]; fileAnalysis?: FileAnalysis; id: string; title: string; scope?: string; state: string; reason: string; reportHash?: string | null; tool?: string; configHash?: string; findingsRetained?: number; findingsReported?: number; findingsSuppressed?: number }>;
 findings: HealthFinding[]; limits: string[]; measurements?: { duplication?: DuplicationMeasurement; coverage?: CoverageMeasurement };
}
/** Compatibility detection for the historical fixed Node recipe; discovery itself never executes code. */
export const supportsNodeCoverage = (snapshot: RepositorySnapshot) => {
 const files = snapshot.files.filter(f => !/(?:^|\/)(?:node_modules|vendor|dist|build|coverage)\//.test(f.path))
 // A filename alone cannot identify Jest/Vitest tests. Do not offer this recipe
 // for a declared framework that the image-owned Node runner cannot execute.
 if (files.some(f => /(?:^|\/)(?:vitest|jest)\.config\./.test(f.path))) return false
 for (const file of files.filter(f => /(?:^|\/)package\.json$/.test(f.path))) {
  if (!file.content) return false
  try {
   const manifest = JSON.parse(file.content)
   const dependencies = {...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies}
   if (Object.keys(dependencies).some(name => /^(?:vitest|jest|@jest\/|@vitest\/)/.test(name))) return false
   if (Object.values(manifest.scripts ?? {}).some(command => typeof command === 'string' && /(?:^|[\s;&|])(?:vitest|jest)(?:[\s;&|]|$)/.test(command))) return false
  } catch { return false }
 }
 return files.some(f => /(?:^|\/)(?:[^/]+\.test|test-[^/]+)\.(?:js|mjs|cjs)$/.test(f.path))
}
export function applicableHealthAnalyses(snapshot: RepositorySnapshot, includeCoverage=false) {
 const paths = snapshot.files.map(f => f.path)
 return healthAnalyses.filter(a => a.id === 'tests.coverage' ? includeCoverage : a.id === 'secrets.scan' ||
  (a.id === 'security.sast' && paths.some(p => /\.(?:js|jsx|ts|tsx|mjs|cjs|py)$/i.test(p))) ||
  (a.id === 'security.dependencies' && paths.some(p => /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|requirements[^/]*\.txt|go\.(?:mod|sum)|Cargo\.lock|pom\.xml|Gemfile\.lock)$/.test(p))) ||
  (['quality.reliability', 'quality.maintainability', 'security.hotspots'].includes(a.id) && paths.some(p => /\.(?:js|jsx|ts|tsx|mjs|cjs|py)$/i.test(p))) ||
  (a.id === 'quality.duplication' && paths.some(p => /\.(?:js|jsx|ts|tsx|mjs|cjs|py|java|go|rb|php|cs|css|scss|sql|rs)$/i.test(p))) ||
  (a.id === 'iac.policy' && paths.some(p => /\.tf$/.test(p) || /(?:^|\/)(?:k8s|kubernetes|helm)\//.test(p))))
}
export function healthReport(inspection: HealthReport['inspection'], analyses: HealthReport['analyses'], checks: NativeReceiptCheck[] = [], comparisonKey = 'inspection-v1'): HealthReport {
 const findings: HealthFinding[] = [], seen = new Set<string>()
 for (const check of checks) for (const f of check.findings ?? []) {
  if (f.suppressed) continue
  // Keep source identities stable across revisions, while separating different analyzers.
  const fingerprint = digest({ checkId: check.ruleId, fingerprint: f.fingerprint })
  if (!seen.has(fingerprint)) { seen.add(fingerprint); findings.push({ ...f, fingerprint, checkId: check.ruleId, evidence: 'ANALYZER_REPORTED', guidance: findingGuidance(check.ruleId, f.ruleId) }) }
 }
 const projected = analyses.map(raw => {
  const {fileAnalysis:_priorCounters,...input}=raw
  const scope = input.scope ?? healthAnalyses.find(definition => definition.id === input.id)?.scope
  const a = {...input, ...(scope ? {scope} : {})}
  const c = checks.find(c => c.ruleId === a.id)
  return c ? { ...a, ...(c.testResults?{testResults:c.testResults}:{}), ...(c.scanErrors?.length?{scanErrors:c.scanErrors}:{}), ...(fileAnalysisRules.includes(c.ruleId) && c.cleanupConfirmed && c.state!=='INCOMPLETE' && validFileAnalysis(c.fileAnalysis) ? {fileAnalysis:c.fileAnalysis}:{}), state: c.state, reason: c.reason, reportHash: c.reportHash, tool: c.toolVersion, configHash: c.configHash, findingsRetained: c.findings?.length, findingsReported: typeof c.summary?.results === 'number' ? c.summary.results : undefined, findingsSuppressed: typeof c.summary?.suppressed === 'number' ? c.summary.suppressed : undefined } : a
 })
 const executed = checks.length > 0
 const complete = inspection.complete && projected.length > 0 && projected.every(a => {
  const c = checks.find(c => c.ruleId === a.id)
  return c && healthAnalysisComplete(c)
 })
 // Compare complete findings within measured fixed code-rule scopes separately
 // from engineering-control completeness. Unknown scopes are never inferred.
 const comparable = inspection.complete ? checks.filter(c =>
  fileAnalysisRules.includes(c.ruleId) && c.cleanupConfirmed && c.state !== 'INCOMPLETE' &&
  validFileAnalysis(c.fileAnalysis) && c.fileAnalysis.analyzedFiles > 0 && c.fileAnalysis.skippedFiles === 0 &&
  /^[a-f0-9]{64}$/.test(c.reportHash ?? '') && !!c.toolVersion && /^[a-f0-9]{64}$/.test(c.configHash ?? '') &&
  c.findings !== undefined && c.summary?.results === c.findings.length &&
  Number(c.summary?.suppressed ?? 0) === 0 && new Set(c.findings.map(f=>f.fingerprint)).size === c.findings.length
 ).sort((a,b)=>a.ruleId.localeCompare(b.ruleId)) : []
 const findingComparison = comparable.length ? {version:1 as const,
  key:digest({version:1,comparisonKey,scopes:comparable.map(c=>({id:c.ruleId,tool:c.toolVersion,config:c.configHash,files:c.fileAnalysis}))}),
  checkIds:comparable.map(c=>c.ruleId)} : undefined
 const coverage=checks.find(c=>c.ruleId==='tests.coverage' && c.state==='PASS' && c.cleanupConfirmed && validCoverageMeasurement(c.measurement))?.measurement as CoverageMeasurement|undefined
 const duplication=checks.find(c=>c.ruleId==='quality.duplication' && c.state!=='INCOMPLETE' && c.cleanupConfirmed && validDuplicationMeasurement(c.measurement) && c.measurement.analyzedLines > 0)?.measurement as DuplicationMeasurement|undefined
 return { ...(findingComparison ? {findingComparison} : {}), ...((duplication || coverage) ? {measurements:{...(duplication?{duplication}:{}),...(coverage?{coverage}:{})}} : {}), version: 1, completeness: complete ? 'COMPLETE' : 'PARTIAL', mode: executed ? 'EXECUTED' : 'INSPECTION_ONLY', comparisonKey, inspection, analyses: projected, findings,
  limits: [
   ...(!executed ? ['No analyzer ran. This report contains repository inspection only; findings and health cannot be determined.'] : []),
   ...(!complete ? ['Analysis is incomplete. Review each analysis outcome and retained finding count; missing analysis is not zero issues.'] : []),
   'Analyzer findings are potential issues, not independently validated vulnerabilities. Zero findings apply only to the recorded analysis scope.',
   'Reliability and maintainability findings apply only to the recorded rules and supported languages; no overall quality grade is calculated.',
   ...(duplication ? ['Duplication uses unique-lines-v1 within the recorded analyzed scope; excluded or unsupported files are not part of its denominator.'] : ['Duplication measurements are unavailable until a qualified analyzer supplies a measured nonempty scope.']),
   'Hotspot reviews are human decisions for the retained findings at this commit, not proof of safety or a change to scan evidence. Coverage and complexity require qualified measured sources.',
   ...(coverage?[coverage.version===2?'Coverage combines reported lines from the configured test packages after successful execution at this commit. Repository-authored tests and coverage configuration define the measured scope; this is not independent proof of test adequacy.':'Coverage uses node-covered-lines-v1 for loaded source files during the recorded successful Node tests.']:['Coverage is supplied by verified CI reports for the assessed commit. Repository Health does not execute tests.']),
  ] }
}
export function comparableFindingScope(current: HealthReport, prior: HealthReport) {
 if (current.mode !== 'EXECUTED' || prior.mode !== 'EXECUTED' || current.comparisonKey !== prior.comparisonKey || (current.selection??'all')!==(prior.selection??'all')) return null
 if (current.findingComparison || prior.findingComparison) {
  const now = current.findingComparison, before = prior.findingComparison
  if (!now || !before || now.version !== 1 || before.version !== 1 || now.key !== before.key ||
   !now.checkIds.length || digest(now.checkIds) !== digest(before.checkIds)) return null
  return now.checkIds
 }
 // Historical reports retain their original complete-report comparison rule.
 return current.completeness === 'COMPLETE' && prior.completeness === 'COMPLETE' ? [] : null
}
function scopedFindings(report: HealthReport, scope: string[]) {
 return report.findings.filter(f => !scope.length || scope.includes(f.checkId))
}
export function comparableHealthTrend(current: HealthReport, prior?: HealthReport | null) {
 if (!prior) return null
 const scope = comparableFindingScope(current, prior)
 if (scope === null) return null
 const now = new Set(scopedFindings(current,scope).map(f=>f.fingerprint)), before = new Set(scopedFindings(prior,scope).map(f=>f.fingerprint))
 return { introduced: [...now].filter(f => !before.has(f)).length, noLongerReported: [...before].filter(f => !now.has(f)).length,
  ...(scope.length ? {checkIds:scope} : {}) }
}
export function redactHealthSource(text: string) {
 // Do not expose obvious credential assignments or private-key material from context lines.
 let privateKey = false
 return text.split('\n').map(line => {
  if (/-----BEGIN .*PRIVATE KEY/.test(line)) privateKey = true
  const hide = privateKey || /Bearer\s|(?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?[^\s"']{4,}|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}/i.test(line)
  if (/-----END .*PRIVATE KEY/.test(line)) privateKey = false
  return hide ? '[Sensitive source line hidden]' : line.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
 }).join('\n')
}

export function healthFindingCount(report: HealthReport, category?: string, checkIds?: string[]) {
 if (report.findingSummary) return !category && !checkIds?.length ? report.findingSummary.total : report.findingSummary.groups.filter(g=>(!category || g.category===category) && (!checkIds?.length || checkIds.includes(g.checkId ?? ''))).reduce((sum,g)=>sum+g.count,0)
 return report.findings.filter(f=>(!category || f.category===category) && (!checkIds?.length || checkIds.includes(f.checkId))).length
}

/** Plot available observations; only equivalent measured scopes receive a comparison value. */
export function healthTimeline(current: HealthReport | null, records: Array<{
 id: string; state: string; sourceSha: string | null; finishedAt: Date | null; report: HealthReport | null
}>) {
 if (!current) return []
 const securityByCommit=new Map<string,{standard?:any;ai?:any}>();
 const severities=['critical','high','medium','low','unknown'];
 return records.filter(row => (row.state === 'COMPLETED' || (row.state==='FAILED' && row.report?.analyses.some(a=>a.id==='security.strix') && healthFindingCount(row.report)>0)) && row.sourceSha && row.finishedAt && row.report?.mode === 'EXECUTED' &&
  (healthFindingCount(row.report) > 0 || row.report.completeness === 'COMPLETE' || row.report.analyses.some(analysis =>
   analysis.reportHash && Number.isSafeInteger(analysis.findingsRetained) && analysis.findingsRetained! >= 0)))
  .sort((a,b) => a.finishedAt!.getTime() - b.finishedAt!.getTime() || a.id.localeCompare(b.id))
  .map(row => {
   const comparable = comparableFindingScope(current, row.report!) !== null
   return {id:row.id,sourceSha:row.sourceSha!,at:row.finishedAt!.toISOString(),findings:healthFindingCount(row.report!),
    categories:Object.fromEntries(['security','reliability','maintainability'].map(category=>{
     const report=row.report!;
     const checks=report.analyses.filter(a=>a.id==='security.strix' ? category==='security' : healthAnalyses.find(d=>d.id===a.id)?.category===category);
     const checkIds=category==='security' ? ['secrets.scan','security.sast','security.dependencies','iac.policy','security.strix'] : checks.map(a=>a.id);
     const count=healthFindingCount(report,category,checkIds);
     const groups=report.findingSummary?.groups ?? report.findings.map(f=>({category:f.category,checkId:f.checkId,severity:f.severity,count:1}));
     const bySeverity=Object.fromEntries(severities.map(severity=>[severity,groups.filter(g=>g.category===category && checkIds.includes(g.checkId??'') && (severities.includes(g.severity??'')?g.severity:'unknown')===severity).reduce((n,g)=>n+g.count,0)]));
     const recorded=count>0 || checks.some(a=>a.reportHash && Number.isSafeInteger(a.findingsRetained));
     const complete=recorded && report.inspection.complete && checks.length>0 && checks.every(a=>a.state!=='INCOMPLETE' && a.reportHash && a.findingsReported===a.findingsRetained);
     const comparable=complete && !checks.some(a=>a.id==='security.strix') && (report.completeness==='COMPLETE' || checks.every(a=>report.findingComparison?.checkIds.includes(a.id)));
     return [category,recorded ? {findings:count,bySeverity,partial:!complete,comparisonKey:comparable ? digest({category,key:report.findingComparison?.key ?? report.comparisonKey,checks:checks.map(a=>[a.id,a.tool,a.configHash]).sort()}) : null} : null];
    })),
    partial:row.report!.completeness !== 'COMPLETE',
    scope:row.report!.analyses.some(a=>a.id==='security.strix') ? 'ai' : row.report!.selection ?? 'all',
    comparableFindings:comparable ? healthFindingCount(row.report!,undefined,current.findingComparison?.checkIds) : null,
    ...(comparable && current.findingComparison ? {checkIds:current.findingComparison.checkIds} : {})}
  }).map(point=>{
   const value=point.categories.security;
   if(!value)return point;
   const sources=securityByCommit.get(point.sourceSha)??{};
   if(point.scope==='ai')sources.ai=value;else sources.standard=value;
   securityByCommit.set(point.sourceSha,sources);
   const values=[sources.standard,sources.ai].filter(Boolean);
   return {...point,categories:{...point.categories,security:{...value,
    findings:values.reduce((n,v)=>n+v.findings,0),
    bySeverity:Object.fromEntries(severities.map(severity=>[severity,values.reduce((n,v)=>n+(v.bySeverity[severity]??0),0)])),
    partial:!sources.standard||values.some(v=>v.partial),comparisonKey:null}}};
  })
}


/** health-assessment-result-v1: outcome within the recorded applicable scope. */
export function healthAssessmentResult(report: HealthReport | null | undefined, state: string): 'PASS' | 'FAIL' | 'INCOMPLETE' | null {
 if(state!=='COMPLETED') return null
 if(report?.selection && report.selection !== 'all') return 'INCOMPLETE'
 if(!report || report.mode!=='EXECUTED' || report.completeness!=='COMPLETE' || !report.inspection?.complete || !report.analyses?.length) return 'INCOMPLETE'
 if(report.analyses.some(analysis=>analysis.state==='FAIL') || healthFindingCount(report)>0) return 'FAIL'
 return report.analyses.every(analysis=>analysis.state==='PASS' && analysis.findingsRetained===0 && analysis.findingsReported===0) ? 'PASS' : 'INCOMPLETE'
}
