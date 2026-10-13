import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { parseArtifact } from '../github-events/ci-artifact-parser.js'
export type ReportRuleGuidance = {
  version: 1; source: 'ANALYZER_REPORT'; explanation?: string; advice?: string;
}
export type RelatedFindingLocation = {path: string; line: number; endLine: number}
export type ReportFinding = {
  relatedLocations?: RelatedFindingLocation[];
  reportGuidance?: ReportRuleGuidance;
  fingerprint: string; category: string; severity: string; title: string;
  ruleId: string | null; path: string | null; line: number | null; endLine?: number | null; suppressed: boolean;
}
function safeText(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  if (/-----BEGIN|Bearer\s|sk-[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(value))
    return 'Sensitive report details omitted'
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 600)
}
/** Read only plain text from the exact matched rule; never render report Markdown/HTML or fetch links. */
function ruleGuidance(rule: any): ReportRuleGuidance | undefined {
  const clean = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined
    if (/-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(value)) return undefined
    return value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ').trim().slice(0, 2000)
  }
  const description = clean(rule?.fullDescription?.text ?? rule?.shortDescription?.text)
  const advice = clean(rule?.help?.text)
  const normalize = (value: string | undefined) => value?.normalize('NFKC').replace(/[\s\p{P}\p{S}]+/gu, ' ').trim().toLowerCase()
  // Help/remediation repeated as a description is not a separate problem explanation.
  const explanation = description && normalize(description) !== normalize(advice) ? description : undefined
  return explanation || advice ? { version:1, source:'ANALYZER_REPORT', ...(explanation ? {explanation} : {}), ...(advice ? {advice} : {}) } : undefined
}
function sourcePath(value: unknown) {
  if (typeof value !== 'string' || value.length > 500 || /^[\\/]|^[a-z]+:/i.test(value) || value.split(/[\\/]/).includes('..')) return null
  try { value = decodeURIComponent(value) } catch { return null }
  if (typeof value !== 'string' || /^[\\/]|^[a-z]+:/i.test(value) || value.split(/[\\/]/).includes('..') || /[?#\x00-\x1f]/.test(value)) return null
  return safeText(value, '') || null
}
function finding(value: Omit<ReportFinding, 'fingerprint'>): ReportFinding {
  return { ...value, fingerprint: createHash('sha256').update(JSON.stringify([value.category, value.ruleId, value.path, value.line, value.title])).digest('hex') }
}
/** Location metadata only: failure logs are never returned as finding evidence. */
function junitLocation(test: any): {path:string|null;line:number|null;endLine:number|null} {
  const safePath=(value:unknown) => {
    const path=sourcePath(value)
    return path && !/[\\%]/.test(path) && !path.split('/').some(p=>['','.','..'].includes(p)) ? path : null
  }
  const validLine=(value:unknown) => {
    if(typeof value !== 'string' || !/^\d{1,7}$/.test(value)) return null
    const line=Number(value);return Number.isSafeInteger(line)&&line>0&&line<=1000000?line:null
  }
  const file=safePath(test['@_file'])
  if(test['@_file'] !== undefined && !file) return {path:null,line:null,endLine:null}
  if(test['@_line'] !== undefined && file) {
    const line=validLine(test['@_line']);return {path:file,line,endLine:line}
  }
  const frames:Array<{path:string;line:string;functionName?:string}>=[]
  for(const failure of [...(test.failure??[]),...(test.error??[])]) {
    const raw=typeof failure==='string'?failure:failure?.['#text']
    if(typeof raw!=='string') continue
    // Decode only standard quote/ampersand entities; never expand user entities.
    const text=raw.slice(0,65536).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')
    for(const match of text.matchAll(/^\s*File ["']([^"'\r\n]{1,500})["'], line (\d{1,12})(?:, in ([^\r\n]{1,200}))?/gm)) {
      frames.push({path:match[1],line:match[2],functionName:match[3]?.trim()})
      if(frames.length>=50) break
    }
    if(!frames.length) for(const match of text.matchAll(/^\s*([^\s:\r\n]{1,500}\.(?:py|js|jsx|ts|tsx)):(\d{1,12}):(?:\s|$)/gm)) {
      frames.push({path:match[1],line:match[2]});if(frames.length>=50) break
    }
  }
  const named=frames.filter(frame=>frame.functionName===test['@_name'])
  const candidates=named.length?named:file?frames.filter(frame=>safePath(frame.path)===file):frames
  const unique=[...new Map(candidates.map(frame=>[`${frame.path}:${frame.line}`,frame])).values()]
  // Multiple unmatched locations are ambiguous; do not pick a framework frame.
  const chosen=unique.length===1?unique[0]:undefined
  const path=chosen?safePath(chosen.path):file,line=chosen?validLine(chosen.line):null
  return {path:line?path:file,line:path?line:null,endLine:path?line:null}
}
/** Reuses bounded schema/checksum validation before projecting untrusted report data. No HTML or logs. */
export function normalizeReportFindings(format: string, content: Uint8Array, sha256: string, profile: 'ci' | 'health' = 'ci'): ReportFinding[] {
  const text = Buffer.from(content).toString('utf8')
  parseArtifact(format, text, sha256, profile)
  const rows: ReportFinding[] = []
  if (format === 'sarif') {
    const report = JSON.parse(text.replace(/^\uFEFF/, ''))
    for (const run of report.runs) for (const result of run.results ?? []) {
      // Do not resolve another tool component or an ambiguous/mismatched rule descriptor.
      const rules = run.tool?.driver?.rules ?? []
      const candidates = rules.filter((rule: any) => rule.id === result.ruleId)
      const indexed = Number.isSafeInteger(result.ruleIndex) && result.ruleIndex >= 0 ? rules[result.ruleIndex] : undefined
      const rule = !result.rule?.toolComponent && candidates.length === 1 &&
        (result.ruleIndex === undefined || indexed === candidates[0]) ? candidates[0] : undefined
      const score = Number(result.properties?.['security-severity'] ?? rule?.properties?.['security-severity'])
      const level = result.level ?? rule?.defaultConfiguration?.level
      const severity = Number.isFinite(score) && score <= 10 && score >= 9 ? 'critical' : Number.isFinite(score) && score <= 10 && score >= 7 ? 'high' : level === 'error' ? 'high' : level === 'warning' ? 'medium' : level === 'note' || level === 'none' ? 'low' : 'unknown'
      const location = result.locations?.[0]?.physicalLocation
      const line = location?.region?.startLine
      const endLine = location?.region?.endLine
      const relatedLocations: RelatedFindingLocation[] = []
      for(const related of result.relatedLocations ?? []) {
        const physical=related.physicalLocation, path=sourcePath(physical?.artifactLocation?.uri)
        const start=physical?.region?.startLine, end=physical?.region?.endLine ?? start
        if(!path || !Number.isSafeInteger(start) || start<1 || !Number.isSafeInteger(end) || end<start || end>1000000) continue
        if(path===sourcePath(location?.artifactLocation?.uri) && start===line && end===(endLine??line)) continue
        if(relatedLocations.some(item=>item.path===path&&item.line===start&&item.endLine===end)) continue
        relatedLocations.push({path,line:start,endLine:end})
        if(relatedLocations.length===3) break
      }
      rows.push(finding({ category: 'security', severity,
        ...(relatedLocations.length ? {relatedLocations} : {}),
        ...(ruleGuidance(rule) ? {reportGuidance:ruleGuidance(rule)} : {}),
        title: safeText(result.message?.text, 'Scanner reported a finding'),
        ruleId: typeof result.ruleId === 'string' ? safeText(result.ruleId, 'Unknown rule') : null,
        path: sourcePath(location?.artifactLocation?.uri), line: Number.isSafeInteger(line) && line > 0 ? line : null,
        endLine: Number.isSafeInteger(line) && Number.isSafeInteger(endLine) && endLine >= line ? endLine : null,
        suppressed: result.suppressions?.some((value: any) => value.status === 'accepted') ?? false,
      }))
    }
  } else if (format === 'junit') {
    const report = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false,
      isArray: (name) => ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(name) }).parse(text)
    const visit = (node: any) => {
      for (const test of node?.testcase ?? []) if (test.failure || test.error) {
        // Enrich source display without changing existing finding IDs, triage or links.
        const original=finding({ category: 'tests', severity: 'high', title: safeText(test['@_name'], 'Test failed'),
          ruleId: 'tests.required', path: sourcePath(test['@_file']), line: null, suppressed: false })
        rows.push({...original,...junitLocation(test)})
      }
      for (const child of node?.testsuite ?? []) visit(child)
    }
    visit(report.testsuites ?? { testsuite: report.testsuite })
  }
  return rows
}
