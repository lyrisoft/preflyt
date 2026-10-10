import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { digest } from '../assessments/assessment-digest.js'
import { previewGate } from '../assessments/gate-preview.js'
import { normalizeReportFindings } from './normalize-report-findings.js'
@Injectable()
export class FindingsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService) {}
  async list(session: AuthenticatedSession, query: Record<string, unknown>) {
    const repository = String(query.repository ?? 'all'), kind = String(query.kind ?? 'findings'),
      severity = String(query.severity ?? 'all'), search = String(query.q ?? '').trim().toLowerCase(), page = Number(query.page ?? 1)
    if (!['findings', 'gaps'].includes(kind) || !['all', 'critical', 'high', 'medium', 'low', 'unknown'].includes(severity) || search.length > 100 || !Number.isSafeInteger(page) || page < 1)
      throw new BadRequestException('Invalid findings filters')
    await this.access.requireOrganization(session, 'assessment.read')
    const scope = await this.access.repositoryScope(session.identityId, session.organizationId, 'assessment.read')
    const selected = scope.filter((item) => repository === 'all' || String(item.githubId) === repository)
    if (repository !== 'all' && !selected.length) throw new ForbiddenException('Repository is outside your authorized scope')
    const records = await this.db.commitAssessment.findMany({ where: { repositoryId: { in: selected.map((item) => item.id) } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 201 })
    const snapshots = records.slice(0, 200)
    for (const snapshot of snapshots) if (digest({ request: snapshot.request, plan: snapshot.plan, report: snapshot.report }) !== snapshot.assessmentHash)
      throw new ConflictException('Assessment integrity check failed; inspect the affected assessment')
    const latest = new Map<string, typeof snapshots[number]>()
    for (const snapshot of snapshots) {
      const key = `${snapshot.repositoryId}:${snapshot.sourceSha}`
      if (!latest.has(key)) latest.set(key, snapshot)
    }
    const artifactRefs = [...latest.values()].flatMap((snapshot) => ((snapshot.report as any).observations ?? []).flatMap((observation: any) => (observation.artifacts ?? []).map((artifact: any) => artifact.id))).filter((id): id is string => typeof id === 'string')
    const ids = [...new Set(artifactRefs)].slice(0, 100)
    const artifacts = await this.db.ciArtifactImport.findMany({ where: { id: { in: ids }, evidence: { repositoryGithubId: { in: selected.map((item) => item.githubId) } } }, include: { evidence: true }, take: 100 })
    const artifactById = new Map(artifacts.map((item) => [item.id, item]))
    const rows: any[] = []
    let detailTruncated = false
    const parsed = new Map<string, ReturnType<typeof normalizeReportFindings>>()
    for (const snapshot of latest.values()) {
      if (rows.length >= 2000) { detailTruncated = true; break }
      const repo = selected.find((item) => item.id === snapshot.repositoryId)!
      const request = snapshot.request as any, report = snapshot.report as any, plan = snapshot.plan as any
      const base = { repositoryId: String(repo.githubId), repository: repo.fullName, sourceSha: snapshot.sourceSha,
        assessmentId: snapshot.id, assessmentHash: snapshot.assessmentHash, observedAt: snapshot.createdAt.toISOString(),
        pullRequest: request.pullRequest?.number ?? null }
      for (const rule of previewGate(snapshot).rules) {
        if ((kind === 'gaps' && rule.status === 'INCOMPLETE') || (kind === 'findings' && rule.status === 'BLOCK')) {
          const definition = plan.checks?.find((check: any) => check.id === rule.ruleId)
          if (rows.length >= 2000) { detailTruncated = true; break }
          rows.push({ ...base, id: digest([repo.githubId.toString(), snapshot.sourceSha, rule.ruleId]),
            title: rule.title, category: kind === 'gaps' ? 'evidence' : 'check', severity: definition?.severity ?? 'unknown',
            status: kind === 'gaps' ? 'Evidence missing' : 'Failed', path: null, line: null, ruleId: rule.ruleId,
            evidence: rule.reasons, artifactId: null, occurrences: 1, verification: 'Assessment verified' })
        }
      }
      if (kind !== 'findings') continue
      for (const observation of report.observations ?? []) for (const ref of observation.artifacts ?? []) {
        const artifact = artifactById.get(ref.id)
        if (!artifact) { detailTruncated = true; continue }
        if (artifact.sha256 !== ref.sha256 || artifact.deliveryId !== observation.deliveryId || artifact.evidence.sourceSha !== snapshot.sourceSha || artifact.evidence.repositoryGithubId !== repo.githubId || artifact.evidence.installationId !== repo.installationId)
          throw new ConflictException('Finding report scope or integrity mismatch')
        if (!parsed.has(artifact.id)) parsed.set(artifact.id, normalizeReportFindings(artifact.format, artifact.content, artifact.sha256))
        for (const finding of parsed.get(artifact.id)!) {
          if (rows.length >= 2000) { detailTruncated = true; break }
          rows.push({ ...base, ...finding, id: digest([String(repo.githubId), snapshot.sourceSha, finding.fingerprint]),
            status: finding.suppressed ? 'Suppressed' : 'Reported', evidence: [artifact.sha256],
            artifactId: artifact.id, occurrences: 1, verification: ref.verification })
        }
      }
    }
    const unique = new Map<string, any>()
    for (const row of rows) { const existing = unique.get(row.id); if (existing) existing.occurrences++; else unique.set(row.id, row) }
    const filtered = [...unique.values()].filter((row) => (severity === 'all' || row.severity === severity) && (!search || `${row.title} ${row.repository} ${row.ruleId ?? ''} ${row.path ?? ''}`.toLowerCase().includes(search)))
    return { rows: filtered.slice((page - 1) * 50, page * 50), total: filtered.length, page, pageSize: 50,
      truncated: records.length > 200 || new Set(artifactRefs).size > 100 || detailTruncated,
      repositories: scope.map((repo) => ({ githubId: String(repo.githubId), fullName: repo.fullName })),
      assessedRevisions: latest.size }
  }
}
