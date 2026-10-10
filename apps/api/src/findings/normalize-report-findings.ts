import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { parseArtifact } from '../github-events/ci-artifact-parser.js'
export type ReportFinding = {
  fingerprint: string; category: string; severity: string; title: string;
  ruleId: string | null; path: string | null; line: number | null; suppressed: boolean;
}
function safeText(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  if (/-----BEGIN|Bearer\s|sk-[a-zA-Z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(value))
    return 'Sensitive report details omitted'
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 600)
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
/** Reuses bounded schema/checksum validation before projecting untrusted report data. No HTML or logs. */
export function normalizeReportFindings(format: string, content: Uint8Array, sha256: string): ReportFinding[] {
  const text = Buffer.from(content).toString('utf8')
  parseArtifact(format, text, sha256)
  const rows: ReportFinding[] = []
  if (format === 'sarif') {
    const report = JSON.parse(text.replace(/^\uFEFF/, ''))
    for (const run of report.runs) for (const result of run.results ?? []) {
      const rule = run.tool?.driver?.rules?.find((rule: any) => rule.id === result.ruleId)
      const score = Number(result.properties?.['security-severity'] ?? rule?.properties?.['security-severity'])
      const level = result.level ?? rule?.defaultConfiguration?.level
      const severity = Number.isFinite(score) && score <= 10 && score >= 9 ? 'critical' : Number.isFinite(score) && score <= 10 && score >= 7 ? 'high' : level === 'error' ? 'high' : level === 'warning' ? 'medium' : level === 'note' || level === 'none' ? 'low' : 'unknown'
      const location = result.locations?.[0]?.physicalLocation
      const line = location?.region?.startLine
      rows.push(finding({ category: 'security', severity,
        title: safeText(result.message?.text, 'Scanner reported a finding'),
        ruleId: typeof result.ruleId === 'string' ? safeText(result.ruleId, 'Unknown rule') : null,
        path: sourcePath(location?.artifactLocation?.uri), line: Number.isSafeInteger(line) && line > 0 ? line : null,
        suppressed: result.suppressions?.some((value: any) => value.status === 'accepted') ?? false,
      }))
    }
  } else if (format === 'junit') {
    const report = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false,
      isArray: (name) => ['testsuite', 'testcase', 'failure', 'error', 'skipped'].includes(name) }).parse(text)
    const visit = (node: any) => {
      for (const test of node?.testcase ?? []) if (test.failure || test.error) {
        rows.push(finding({ category: 'tests', severity: 'high', title: safeText(test['@_name'], 'Test failed'),
          ruleId: 'tests.required', path: sourcePath(test['@_file']), line: null, suppressed: false }))
      }
      for (const child of node?.testsuite ?? []) visit(child)
    }
    visit(report.testsuites ?? { testsuite: report.testsuite })
  }
  return rows
}
