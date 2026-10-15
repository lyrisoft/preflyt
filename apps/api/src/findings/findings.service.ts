import { findingReferenceGuidance } from '../health/finding-guidance.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  rolePermissions,
  AuthorizationService,
} from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { digest } from "../assessments/assessment-digest.js";
import { previewGate } from "../assessments/gate-preview.js";
import { normalizeReportFindings } from "./normalize-report-findings.js";
import { FindingSourceStore } from "./finding-source-store.service.js";
import { hiddenSource } from "./finding-source-store.js";
import type { HealthReport } from "../health/health-report.js";
import { summarizeFindings } from "./findings-summary.js";
import { aiReviewFindingRows } from './ai-review-findings.js';
import { redactHealthSource } from '../health/health-report.js';
@Injectable()
export class FindingsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(FindingSourceStore) private readonly sources: FindingSourceStore,
  ) {}
  async list(
    session: AuthenticatedSession,
    query: Record<string, unknown>,
    lookupId?: string,
  ) {
    const triage = String(query.triage ?? "all");
    const category = String(query.category ?? "all");
    // Legacy Health card links remain exact-report filters; the default list is shared.
    const source = String(query.source ?? (query.origin === "health" ? "health" : "all"));
    const health = query.health === undefined ? undefined : String(query.health);
    const repository = String(query.repository ?? "all"),
      kind = String(query.kind ?? "findings"),
      severity = String(query.severity ?? "all"),
      search = String(query.q ?? "")
        .trim()
        .toLowerCase(),
      page = Number(query.page ?? 1);
    if (
      !["all", "REPORTED", "IN_REVIEW", "RESOLVED"].includes(triage) ||
      !["findings", "gaps", "ai"].includes(kind) ||
      !["all", "ci", "health", "ai"].includes(source) ||
      (health !== undefined && (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(health) || source !== "health" || repository === "all")) ||
      !["all", "critical", "high", "medium", "low", "unknown"].includes(
        severity,
      ) ||
      !["all","security","reliability","maintainability","duplication","hotspot","coverage","tests","check","ai"].includes(category) ||
      search.length > 100 ||
      !Number.isSafeInteger(page) ||
      page < 1
    )
      throw new BadRequestException("Invalid findings filters");
    await this.access.requireOrganization(session, "assessment.read");
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      "assessment.read",
    );
    const selected = scope.filter(
      (item) => repository === "all" || String(item.githubId) === repository,
    );
    if (repository !== "all" && !selected.length)
      throw new ForbiddenException(
        "You do not have access to this repository. Ask your administrator for access.",
      );
    const assessment = lookupId && query.assessment !== undefined ? String(query.assessment) : undefined;
    if (assessment !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(assessment)) throw new BadRequestException("Choose a valid assessment");
    if (kind === 'ai' || source === 'ai') {
      const result = await this.aiFindings(session, selected, scope, { page, search, severity, category, triage, assessment, lookupId });
      return kind === 'gaps' ? { ...result, rows: [], total: 0, summary: summarizeFindings([], 'gaps') } : result;
    }
    const records = source === "health" ? [] : await this.db.commitAssessment.findMany({
      where: { repositoryId: { in: selected.map((item) => item.id) }, ...(assessment ? { id: assessment } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 201,
    });
    const snapshots = records.slice(0, 200);
    for (const snapshot of snapshots)
      if (
        digest({
          request: snapshot.request,
          plan: snapshot.plan,
          report: snapshot.report,
        }) !== snapshot.assessmentHash
      )
        throw new ConflictException(
          "Assessment integrity check failed; inspect the affected assessment",
        );
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.repositoryId}:${snapshot.sourceSha}`;
      if (!latest.has(key)) latest.set(key, snapshot);
    }
    const artifactRefs = [...latest.values()]
      .flatMap((snapshot) =>
        ((snapshot.report as any).observations ?? []).flatMap(
          (observation: any) =>
            (observation.artifacts ?? []).map((artifact: any) => artifact.id),
        ),
      )
      .filter((id): id is string => typeof id === "string");
    const ids = [...new Set(artifactRefs)].slice(0, 100);
    const artifacts = await this.db.ciArtifactImport.findMany({
      where: {
        id: { in: ids },
        evidence: {
          repositoryGithubId: { in: selected.map((item) => item.githubId) },
        },
      },
      include: { evidence: true },
      take: 100,
    });
    const artifactById = new Map(artifacts.map((item) => [item.id, item]));
    const rows: any[] = [];
    let detailTruncated = false;
    const parsed = new Map<
      string,
      ReturnType<typeof normalizeReportFindings>
    >();
    for (const snapshot of latest.values()) {
      if (rows.length >= 2000) {
        detailTruncated = true;
        break;
      }
      const repo = selected.find((item) => item.id === snapshot.repositoryId)!;
      const request = snapshot.request as any,
        report = snapshot.report as any,
        plan = snapshot.plan as any;
      const base = {
        origin: "ci",
        repositoryId: String(repo.githubId),
        repository: repo.fullName,
        sourceSha: snapshot.sourceSha,
        assessmentId: snapshot.id,
        assessmentHash: snapshot.assessmentHash,
        observedAt: snapshot.createdAt.toISOString(),
        pullRequest: request.pullRequest?.number ?? null,
      };
      for (const rule of previewGate(snapshot).rules) {
        if (rule.status === "INCOMPLETE" || rule.status === "BLOCK") {
          const definition = plan.checks?.find(
            (check: any) => check.id === rule.ruleId,
          );
          if (rows.length >= 2000) {
            detailTruncated = true;
            break;
          }
          rows.push({
            ...base,
            id: digest([
              repo.githubId.toString(),
              snapshot.sourceSha,
              rule.ruleId,
            ]),
            title: rule.title,
            category: rule.status === "INCOMPLETE" ? "evidence" : "check",
            severity: definition?.severity ?? "unknown",
            status:
              rule.status === "INCOMPLETE" ? "Evidence missing" : "Failed",
            path: null,
            line: null,
            ruleId: rule.ruleId,
            evidence: rule.reasons,
            artifactId: null,
            occurrences: 1,
            verification: "Assessment verified",
          });
        }
      }
      for (const observation of report.observations ?? [])
        for (const ref of observation.artifacts ?? []) {
          const artifact = artifactById.get(ref.id);
          if (!artifact) {
            detailTruncated = true;
            continue;
          }
          if (
            artifact.sha256 !== ref.sha256 ||
            artifact.deliveryId !== observation.deliveryId ||
            artifact.evidence.sourceSha !== snapshot.sourceSha ||
            artifact.evidence.repositoryGithubId !== repo.githubId ||
            artifact.evidence.installationId !== repo.installationId
          )
            throw new ConflictException(
              "Finding report scope or integrity mismatch",
            );
          if (!parsed.has(artifact.id))
            parsed.set(
              artifact.id,
              normalizeReportFindings(
                artifact.format,
                artifact.content,
                artifact.sha256,
              ),
            );
          for (const finding of parsed.get(artifact.id)!) {
            if (rows.length >= 2000) {
              detailTruncated = true;
              break;
            }
            rows.push({
              ...base,
              ...finding,
              id: digest([
                String(repo.githubId),
                snapshot.sourceSha,
                finding.fingerprint,
              ]),
              status: finding.suppressed ? "Suppressed" : "Reported",
              evidence: [artifact.sha256],
              artifactId: artifact.id,
              occurrences: 1,
              verification: ref.verification,
            });
          }
        }
    }
    const healthRecords = source === "ci" || lookupId ? [] : await this.db.repositoryHealthAssessment.findMany({
      where: {
        repositoryId: { in: selected.map(item => item.id) },
        organizationId: session.organizationId!,
        state: { in: ["COMPLETED", "FAILED"] },
        ...(health ? { id: health } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 201,
    });
    if (health && !healthRecords.length) throw new NotFoundException("This saved Health report is unavailable in your scope.");
    const latestHealth = new Map<string, (typeof healthRecords)[number]>();
    for (const saved of healthRecords.slice(0, 200)) {
      if (!saved.sourceSha || !saved.report) continue;
      const key = `${saved.repositoryId}:${saved.sourceSha}`;
      if (!latestHealth.has(key)) latestHealth.set(key, saved);
    }
    let incompleteHealth = false;
    for (const saved of latestHealth.values()) {
      const report = saved.report as unknown as HealthReport;
      const repo = selected.find(item => item.id === saved.repositoryId)!;
      if (report.completeness !== "COMPLETE") incompleteHealth = true;
      for (const finding of report.findings) {
        if (rows.length >= 2000) { detailTruncated = true; break; }
        rows.push({
          ...finding,
          id: digest(["health", String(repo.githubId), saved.sourceSha, finding.fingerprint]),
          origin: "health",
          health: saved.id,
          healthFingerprint: finding.fingerprint,
          repositoryId: String(repo.githubId), repository: repo.fullName,
          sourceSha: saved.sourceSha, assessmentId: saved.id,
          observedAt: (saved.finishedAt ?? saved.createdAt).toISOString(),
          status: "Reported", evidence: [finding.evidence],
          verification: "Verified analyzer receipt", occurrences: 1,
        });
      }
    }
    const ai = source === 'all' && kind !== 'gaps' ? await this.aiFindings(session, selected, scope,
      { page: 1, search: '', severity: 'all', category: 'all', triage: 'all', assessment, lookupId }, true) : undefined;
    if (ai) rows.push(...ai.rows);
    // Put all sources in one stable chronological order before deduplication/pagination.
    rows.sort((a, b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? "") || a.id.localeCompare(b.id));
    const unique = new Map<string, any>();
    if (rows.length > 2000) detailTruncated = true;
    for (const row of rows.slice(0, 2000)) {
      const existing = unique.get(row.id);
      if (existing) existing.occurrences++;
      else unique.set(row.id, row);
    }
    let matching = [...unique.values()].filter(
      (row) =>
        (severity === "all" || row.severity === severity) &&
        (category === 'all' || row.category === category ||
          (['check','evidence'].includes(row.category) && ({security:/^(?:security\.(?!hotspots$)|secrets\.|iac\.)/,reliability:/^quality\.reliability$/,maintainability:/^quality\.maintainability$/,duplication:/^quality\.duplication$/,hotspot:/^security\.hotspots$/,coverage:/^tests\.coverage$/} as Record<string,RegExp>)[category]?.test(row.ruleId ?? ''))) &&
        (!search ||
          `${row.title} ${row.recommendation ?? ""} ${row.repository} ${row.sourceSha} ${row.pullRequest ?? ""} ${row.ruleId ?? ""} ${row.path ?? ""}`
            .toLowerCase()
            .includes(search)),
    );
    const dispositions = await this.db.findingDisposition.findMany({
      where: {
        organizationId: session.organizationId!,
        id: { in: matching.filter(row => ["ci", "ai"].includes(row.origin)).map((row) => row.id) },
      },
    });
    for (const row of matching) {
      row.referenceGuidance = findingReferenceGuidance(row.ruleId);
      const saved = ["ci", "ai"].includes(row.origin) && dispositions.find(
        (item) => item.id === row.id && item.sourceSha === row.sourceSha,
      );
      row.triage = saved
        ? {
            state: saved.state,
            assigneeId: saved.assigneeId,
            note: saved.note,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          }
        : { state: "REPORTED", assigneeId: null, note: "", revision: 0 };
    }
    matching = matching.filter(
      (row) => triage === "all" || row.triage.state === triage,
    );
    const filtered = matching.filter(
      (row) =>
        (row.category === "evidence") === (kind === "gaps") &&
        (!lookupId || row.id === lookupId),
    );
    return {
      canManage: !!rolePermissions[session.role]?.includes("findings.manage"),
      summary: summarizeFindings(matching, kind),
      rows: filtered.slice((page - 1) * 50, page * 50),
      total: filtered.length,
      page,
      pageSize: 50,
      truncated:
        records.length > 200 ||
        healthRecords.length > 200 || ai?.truncated ||
        new Set(artifactRefs).size > 100 ||
        detailTruncated,
      repositories: scope.map((repo) => ({
        githubId: String(repo.githubId),
        fullName: repo.fullName,
      })),
      assessedRevisions: new Set([...latest.keys(), ...latestHealth.keys(), ...(ai?.rows.map(row => `${selected.find(repo => String(repo.githubId) === row.repositoryId)?.id}:${row.sourceSha}`) ?? [])]).size,
      incompleteHealth,
      inspectionOnly: source === "health" && latestHealth.size > 0 && [...latestHealth.values()].every(saved => (saved.report as unknown as HealthReport).mode === "INSPECTION_ONLY"),
    };
  }

  private async aiFindings(session: AuthenticatedSession, selected: any[], scope: any[],
    filters: { page: number; search: string; severity: string; category: string; triage: string; assessment?: string; lookupId?: string }, allRows = false) {
    const records = await this.db.aiSkillReview.findMany({
      where: { organizationId: session.organizationId!, repositoryId: { in: selected.map(r => r.id) },
        stage: 'pull_request', state: 'SUCCEEDED', ...(filters.assessment ? { assessmentId: filters.assessment } : {}) },
      include: { assessment: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 201,
    });
    const unique = new Map<string, any>();
    let limited = false;
    for (const review of records.slice(0, 200)) {
      const repo = selected.find(r => r.id === review.repositoryId);
      if (!repo || review.assessment.repositoryId !== repo.id) continue;
      for (const row of aiReviewFindingRows(review, repo)) {
        if (unique.size >= 2000) { limited = true; break; }
        if (!unique.has(row.id)) unique.set(row.id, row);
      }
    }
    const dispositions = await this.db.findingDisposition.findMany({ where: {
      organizationId: session.organizationId!, id: { in: [...unique.keys()] },
    } });
    for (const row of unique.values()) {
      const saved = dispositions.find(d => d.id === row.id && d.sourceSha === row.sourceSha);
      row.triage = saved ? { state: saved.state, assigneeId: saved.assigneeId, note: saved.note, revision: saved.revision, updatedAt: saved.updatedAt }
        : { state: 'REPORTED', assigneeId: null, note: '', revision: 0 };
    }
    const matching = [...unique.values()].filter(row =>
      (filters.severity === 'all' || row.severity === filters.severity) && (filters.category === 'all' || filters.category === 'ai') &&
      (filters.triage === 'all' || row.triage.state === filters.triage) &&
      (!filters.lookupId || row.id === filters.lookupId) &&
      (!filters.search || `${row.title} ${row.recommendation} ${row.repository} ${row.sourceSha} ${row.pullRequest} ${row.checkTitle} ${row.evidenceLocations.map((e: any) => e.path ?? e.label).join(' ')}`.toLowerCase().includes(filters.search)));
    await this.access.requireOrganization(session, 'assessment.read');
    const current = await this.access.repositoryScope(session.identityId, session.organizationId, 'assessment.read');
    if (selected.some(repo => !current.some(r => r.id === repo.id)))
      throw new ForbiddenException('Repository access changed. Refresh Findings.');
    return {
      canManage: !!rolePermissions[session.role]?.includes('findings.manage'), summary: summarizeFindings(matching, 'findings'),
      aiSummary: { suggestions: matching.length, repositories: new Set(matching.map(r => r.repositoryId)).size,
        pullRequests: new Set(matching.map(r => `${r.repositoryId}:${r.pullRequest}`)).size },
      rows: allRows ? matching : matching.slice((filters.page - 1) * 50, filters.page * 50), total: matching.length,
      page: filters.page, pageSize: 50, truncated: records.length > 200 || limited,
      repositories: scope.map(repo => ({ githubId: String(repo.githubId), fullName: repo.fullName })),
      assessedRevisions: new Set([...unique.values()].map(r => `${r.repositoryId}:${r.sourceSha}`)).size,
    };
  }

  private async finding(session: AuthenticatedSession, id: string, assessment?: string, origin?: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new BadRequestException("Choose a valid finding");
    if (origin !== undefined && origin !== 'ai') throw new BadRequestException('Choose a valid finding source');
    if (origin === 'ai') {
      const ai = await this.list(session, { kind: 'ai', source: 'ai', ...(assessment ? { assessment } : {}) }, id);
      if (ai.rows[0]) return ai.rows[0];
      throw new NotFoundException('AI suggestion is unavailable in this assessment or repository scope');
    }
    for (const kind of ["findings", "gaps"]) {
      const result = await this.list(session, { kind, source: "ci", ...(assessment ? { assessment } : {}) }, id);
      if (result.rows[0]) return result.rows[0];
    }
    const ai = await this.list(session, { kind: 'ai', source: 'ai', ...(assessment ? { assessment } : {}) }, id);
    if (ai.rows[0]) return ai.rows[0];
    throw new NotFoundException(
      "Finding is unavailable in your current scope or retained assessment window",
    );
  }
  async detail(session: AuthenticatedSession, id: string, assessment?: string, origin?: string) {
    const finding = await this.finding(session, id, assessment, origin);
    await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    return { finding, canManage: !!rolePermissions[session.role]?.includes("findings.manage") };
  }
  async source(session: AuthenticatedSession, id: string, assessment?: string, origin?: string) {
    const finding = await this.finding(session, id, assessment, origin);
    const repo = await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    const base = { path: finding.path, line: finding.line, endLine: finding.endLine ?? finding.line, sourceSha: finding.sourceSha, lines: [] as Array<{ number: number; text: string }>, reason: null as string | null, truncated: false };
    if (!finding.path) return { ...base, reason: finding.category === 'check' || finding.category === 'evidence' ? 'This is a check result, not a finding at a code location. Review its assessment evidence below.' : 'The report did not supply a file location.' };
    if (finding.origin === 'ai' && finding.codeSide === 'LEFT') {
      const review = await this.db.aiSkillReview.findUnique({ where: { id: finding.reviewId }, include: { assessment: true } });
      if (!review || review.organizationId !== session.organizationId || review.repositoryId !== repo.id ||
        !aiReviewFindingRows(review, repo).some(row => row.id === finding.id))
        throw new NotFoundException('The saved review source could not be verified.');
      const available = new Map<number, string>();
      for (const line of (review.snapshot as any).context.source?.lines ?? [])
        if (line.path === finding.path && line.side === 'LEFT' && Math.abs(line.line - finding.line) <= 8)
          available.set(line.line, line.text);
      let first = finding.line, last = finding.line;
      while (available.has(first - 1)) first--;
      while (available.has(last + 1)) last++;
      const lines = [];
      for (let number = first; number <= last; number++)
        if (available.has(number)) lines.push({ number, text: redactHealthSource(available.get(number)!) });
      if (hiddenSource(finding)) for (const line of lines) if (line.number >= finding.line && line.number <= (finding.endLine ?? finding.line)) line.text = '[Potential credential redacted]';
      await this.access.requireRepository(session, finding.repositoryId, 'assessment.read');
      return { ...base, lines, truncated: true, reason: lines.length ? null : 'The review did not retain this changed line.' };
    }
    const excerpt = await this.sources.read(repo.id, finding.sourceSha, finding);
    await this.access.requireRepository(session, finding.repositoryId, "assessment.read");
    return { ...base, ...excerpt };

  }
  async assignees(session: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(session, "findings.manage");
    const finding = await this.finding(session, id);
    const repo = await this.access.requireRepository(
      session,
      finding.repositoryId,
      "findings.manage",
    );
    const members = await this.db.organizationMembership.findMany({
      where: {
        organizationId: session.organizationId!,
        active: true,
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          { grants: { some: { repositoryId: repo.id } } },
        ],
      },
      include: { identity: { include: { githubAccounts: true } } },
      take: 100,
    });
    return members
      .filter((member) =>
        rolePermissions[member.role]?.includes("assessment.read"),
      )
      .map((member) => ({
        id: member.identityId,
        label:
          member.identity.githubAccounts[0]?.login ?? member.identity.subject,
      }));
  }
  async triage(
    session: AuthenticatedSession,
    id: string,
    input: {
      state: string;
      assigneeId?: string | null;
      note: string;
      expectedRevision: number;
    },
  ) {
    if (
      !input ||
      !["REPORTED", "IN_REVIEW", "RESOLVED"].includes(input.state) ||
      typeof input.note !== "string" ||
      input.note.trim().length > 1000 ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      (input.assigneeId != null &&
        (typeof input.assigneeId !== "string" || input.assigneeId.length > 80))
    )
      throw new BadRequestException(
        "Choose a valid triage status, assignee and note",
      );
    await this.access.requireOrganization(session, "findings.manage", true);
    const finding = await this.finding(session, id);
    const repo = await this.access.requireRepository(
      session,
      finding.repositoryId,
      "findings.manage",
    );
    if (input.state === "RESOLVED" && !input.note.trim())
      throw new BadRequestException(
        "Explain the resolution; the original assessment and gate stay unchanged",
      );
    if (input.assigneeId) {
      const member = await this.db.organizationMembership.findUnique({
        where: {
          organizationId_identityId: {
            organizationId: session.organizationId!,
            identityId: input.assigneeId,
          },
        },
        include: { identity: true },
      });
      if (!member?.active)
        throw new BadRequestException(
          "Choose an active member with access to this repository",
        );
      await this.access.requireRepository(
        {
          ...session,
          identityId: member.identityId,
          subject: member.identity.subject,
          role: member.role,
          platformAdmin: false,
        },
        finding.repositoryId,
        "assessment.read",
      );
    }
    return this.db.$transaction(async (tx) => {
      const access = new AuthorizationService(tx as PrismaService);
      await access.requireRepository(
        session,
        finding.repositoryId,
        "findings.manage",
      );
      if (input.assigneeId) {
        const member = await tx.organizationMembership.findUnique({
          where: {
            organizationId_identityId: {
              organizationId: session.organizationId!,
              identityId: input.assigneeId,
            },
          },
          include: { identity: true },
        });
        if (!member?.active)
          throw new BadRequestException(
            "Assignee access changed. Choose an active repository member.",
          );
        await access.requireRepository(
          {
            ...session,
            identityId: member.identityId,
            subject: member.identity.subject,
            role: member.role,
            platformAdmin: false,
          },
          finding.repositoryId,
          "assessment.read",
        );
      }
      const data = {
        assessmentId: finding.assessmentId,
        state: input.state,
        assigneeId: input.assigneeId ?? null,
        note: input.note.trim(),
        updatedById: session.identityId,
      };
      if (input.expectedRevision === 0) {
        const created = await tx.findingDisposition.createMany({
          data: [
            {
              id,
              organizationId: session.organizationId!,
              repositoryGithubId: finding.repositoryId,
              sourceSha: finding.sourceSha,
              ...data,
            },
          ],
          skipDuplicates: true,
        });
        if (!created.count)
          throw new ConflictException(
            "Finding triage changed. Refresh and try again.",
          );
      } else {
        const updated = await tx.findingDisposition.updateMany({
          where: {
            id,
            organizationId: session.organizationId!,
            sourceSha: finding.sourceSha,
            revision: input.expectedRevision,
          },
          data: { ...data, revision: { increment: 1 } },
        });
        if (!updated.count)
          throw new ConflictException(
            "Finding triage changed. Refresh and try again.",
          );
      }
      const saved = await tx.findingDisposition.findUniqueOrThrow({
        where: { id },
      });
      await tx.auditEvent.create({
        data: {
          event: "finding.triage_updated",
          actorId: session.identityId,
          metadata: {
            organizationId: session.organizationId!,
            repositoryId: repo.id,
            findingId: id,
            assessmentId: finding.assessmentId,
            sourceSha: finding.sourceSha,
            state: saved.state,
            revision: saved.revision,
            assigneeId: saved.assigneeId,
          },
        },
      });
      return {
        state: saved.state,
        assigneeId: saved.assigneeId,
        note: saved.note,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      };
    });
  }
}
