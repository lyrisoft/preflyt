import { digest } from '../assessments/assessment-digest.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { ReportFinding } from './normalize-report-findings.js'

export const SOURCE_EXCERPT_VERSION = 1
// Separate cache identity: a secret finding must never reuse a general code excerpt.
export const SECRET_SOURCE_EXCERPT_VERSION = 2
export const FINDING_SOURCE_CONTEXT_LINES = 5
export type SourceLocation = Pick<ReportFinding, 'path' | 'line' | 'endLine' | 'ruleId' | 'title'> & { checkId?: string; relatedLocations?: {path:string;line:number;endLine:number}[] }
export function hiddenSource(finding: SourceLocation) {
  return finding.title === 'Sensitive report details omitted' || finding.checkId === 'secrets.scan' || /secret|gitleaks|private[-_. ]?key|credential|generic-api-key|curl-auth-header|github-(?:fine-grained-)?pat|aws-access-token/i.test(finding.ruleId ?? '')
}
export function sourceLocation(repositoryId: string, sourceSha: string, finding: SourceLocation, contextLines = FINDING_SOURCE_CONTEXT_LINES) {
  const path = finding.path, line = finding.line, endLine = finding.endLine ?? line
  const secret = hiddenSource(finding), version = secret ? SECRET_SOURCE_EXCERPT_VERSION : SOURCE_EXCERPT_VERSION
  if (![5, 8].includes(contextLines) || (secret && !line) || !/^[a-f0-9]{40}$/.test(sourceSha) || !path || path.length > 500 || /[\\%?#\x00-\x1f]/.test(path) || path.split('/').some(p => ['', '.', '..'].includes(p)) ||
    (line !== null && (!Number.isSafeInteger(line) || line < 1 || line > 1000000)) || (endLine !== null && (!Number.isSafeInteger(endLine) || endLine < (line ?? 1) || endLine > 1000000))) return null
  return { id: digest([version, repositoryId, sourceSha, path, line, endLine, contextLines]), repositoryId, sourceSha, path, line, endLine, contextLines, version }
}
/** PostgreSQL queues source capture with the assessment transaction; no network work in transactions. */
export function findingSourceLocations(repositoryId:string, sourceSha:string, findings:SourceLocation[], contextLines=FINDING_SOURCE_CONTEXT_LINES) {
  const locations = findings.flatMap(f => [f,...(f.relatedLocations??[]).map(location=>({...f,...location}))]).map(f => sourceLocation(repositoryId, sourceSha, f, contextLines)).filter((s): s is NonNullable<typeof s> => !!s)
  return [...new Map(locations.map(s => [s.id, s])).values()]
}
export async function queueFindingSources(tx: Prisma.TransactionClient, repositoryId: string, sourceSha: string, findings: SourceLocation[], contextLines = FINDING_SOURCE_CONTEXT_LINES) {
  const unique = findingSourceLocations(repositoryId,sourceSha,findings,contextLines)
  for(let offset=0;offset<unique.length;offset+=500) await tx.findingSourceExcerpt.createMany({ data: unique.slice(offset,offset+500), skipDuplicates: true })
}
