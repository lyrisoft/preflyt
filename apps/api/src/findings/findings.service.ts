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
import { summarizeFindings } from "./findings-summary.js";
@Injectable()
export class FindingsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  async list(
    session: AuthenticatedSession,
    query: Record<string, unknown>,
    lookupId?: string,
  ) {
    const triage = String(query.triage ?? "all");
    const repository = String(query.repository ?? "all"),
      kind = String(query.kind ?? "findings"),
      severity = String(query.severity ?? "all"),
      search = String(query.q ?? "")
        .trim()
        .toLowerCase(),
      page = Number(query.page ?? 1);
    if (
      !["all", "REPORTED", "IN_REVIEW", "RESOLVED"].includes(triage) ||
      !["findings", "gaps"].includes(kind) ||
      !["all", "critical", "high", "medium", "low", "unknown"].includes(
        severity,
      ) ||
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
    const records = await this.db.commitAssessment.findMany({
      where: { repositoryId: { in: selected.map((item) => item.id) } },
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
    const unique = new Map<string, any>();
    for (const row of rows) {
      const existing = unique.get(row.id);
      if (existing) existing.occurrences++;
      else unique.set(row.id, row);
    }
    let matching = [...unique.values()].filter(
      (row) =>
        (severity === "all" || row.severity === severity) &&
        (!search ||
          `${row.title} ${row.repository} ${row.ruleId ?? ""} ${row.path ?? ""}`
            .toLowerCase()
            .includes(search)),
    );
    const dispositions = await this.db.findingDisposition.findMany({
      where: {
        organizationId: session.organizationId!,
        id: { in: matching.map((row) => row.id) },
      },
    });
    for (const row of matching) {
      const saved = dispositions.find(
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
        new Set(artifactRefs).size > 100 ||
        detailTruncated,
      repositories: scope.map((repo) => ({
        githubId: String(repo.githubId),
        fullName: repo.fullName,
      })),
      assessedRevisions: latest.size,
    };
  }

  private async finding(session: AuthenticatedSession, id: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new BadRequestException("Choose a valid finding");
    for (const kind of ["findings", "gaps"]) {
      const result = await this.list(session, { kind }, id);
      if (result.rows[0]) return result.rows[0];
    }
    throw new NotFoundException(
      "Finding is unavailable in your current scope or retained assessment window",
    );
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
