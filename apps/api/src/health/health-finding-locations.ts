import type { ReportFinding } from '../findings/normalize-report-findings.js'
import type { NativeSourceBundle } from '../execution/native-source.js'

/** Source is already verified by admission. No report-supplied source is trusted. */
export function validateHealthFindingLocations(
  findings: ReportFinding[] | undefined,
  source: NativeSourceBundle,
): { findings: ReportFinding[] | undefined; rejected: number } {
  if (findings === undefined) return { findings, rejected: 0 }
  const files = new Map(source.files.map(file => [file.path, file]))
  const lines = new Map<string, number | null>()
  function valid(path: string | null, line: number | null, endLine?: number | null) {
    if (path === null) return line === null && endLine == null
    const file = files.get(path)
    if (!file) return false
    if (line === null) return endLine == null
    if (!Number.isSafeInteger(line) || line < 1 ||
      (endLine != null && (!Number.isSafeInteger(endLine) || endLine < line))) return false
    if (!lines.has(path)) {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(file.content, 'base64'))
        // A final newline terminates the last physical line; it is not another line.
        lines.set(path, text.length === 0 ? 0 : text.split('\n').length - Number(text.endsWith('\n')))
      } catch { lines.set(path, null) }
    }
    const count = lines.get(path)
    return count != null && line <= count && (endLine ?? line) <= count
  }
  const retained = findings.filter(finding =>
    valid(finding.path, finding.line, finding.endLine) &&
    (finding.relatedLocations ?? []).every(location => valid(location.path, location.line, location.endLine)))
  return { findings: retained, rejected: findings.length - retained.length }
}
