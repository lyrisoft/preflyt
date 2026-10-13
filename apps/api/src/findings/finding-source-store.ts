import { digest } from '../assessments/assessment-digest.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { ReportFinding } from './normalize-report-findings.js'

export const SOURCE_EXCERPT_VERSION = 1
export type SourceLocation = Pick<ReportFinding, 'path' | 'line' | 'endLine' | 'ruleId' | 'title'> & { checkId?: string }
export function hiddenSource(finding: SourceLocation) {
  return finding.title === 'Sensitive report details omitted' || finding.checkId === 'secrets.scan' || /secret|gitleaks|private[-_. ]?key|credential/i.test(finding.ruleId ?? '')
}
export function sourceLocation(repositoryId: string, sourceSha: string, finding: SourceLocation, contextLines = 8) {
  const path = finding.path, line = finding.line, endLine = finding.endLine ?? line
  if (![5, 8].includes(contextLines) || hiddenSource(finding) || !/^[a-f0-9]{40}$/.test(sourceSha) || !path || path.length > 500 || /[\\%?#\x00-\x1f]/.test(path) || path.split('/').some(p => ['', '.', '..'].includes(p)) ||
    (line !== null && (!Number.isSafeInteger(line) || line < 1 || line > 1000000)) || (endLine !== null && (!Number.isSafeInteger(endLine) || endLine < (line ?? 1) || endLine > 1000000))) return null
  return { id: digest([SOURCE_EXCERPT_VERSION, repositoryId, sourceSha, path, line, endLine, contextLines]), repositoryId, sourceSha, path, line, endLine, contextLines, version: SOURCE_EXCERPT_VERSION }
}
/** PostgreSQL queues source capture with the assessment transaction; no network work in transactions. */
export async function queueFindingSources(tx: Prisma.TransactionClient, repositoryId: string, sourceSha: string, findings: SourceLocation[], contextLines = 8) {
  const locations = findings.map(f => sourceLocation(repositoryId, sourceSha, f, contextLines)).filter((s): s is NonNullable<typeof s> => !!s)
  const unique = [...new Map(locations.map(s => [s.id, s])).values()].slice(0, 500)
  if (unique.length) await tx.findingSourceExcerpt.createMany({ data: unique, skipDuplicates: true })
}
