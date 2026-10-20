import { redactHealthSource } from '../health/health-report.js'
/** Bound source display to a verified file. Reported coordinates are never inferred. */
export function sourceExcerpt(text: string, line: number | null, endLine?: number | null, contextLines = 8) {
  const all = redactHealthSource(text).split('\n')
  return sourceExcerptLines(all,line,endLine,contextLines)
}
/** Input must already be redacted; reuse a verified file for all of its findings. */
export function sourceExcerptLines(all:string[], line:number|null, endLine?:number|null, contextLines=8) {
  if (line !== null && (!Number.isSafeInteger(line) || line < 1 || line > all.length)) return { lines: [], reason: 'The reported line is outside this file at the assessed commit.', truncated: false }
  const lastReported = endLine ?? line
  if (lastReported !== null && (!Number.isSafeInteger(lastReported) || lastReported < (line ?? 1) || lastReported > all.length)) return { lines: [], reason: 'The reported code range is outside this file at the assessed commit.', truncated: false }
  const first = line ? Math.max(1, line - contextLines) : 1
  const last = Math.min(all.length, first + 59, line ? (lastReported ?? line) + contextLines : 30)
  return { lines: all.slice(first - 1, last).map((text, index) => ({ number: first + index, text: text.slice(0, 2000) })),
    reason: null, truncated: (lastReported ?? all.length) > last || all.slice(first - 1, last).some(text => text.length > 2000) }
}
