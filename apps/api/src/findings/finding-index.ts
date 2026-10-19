import { ConflictException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { digest } from "../assessments/assessment-digest.js";
import { findingIgnoreId, ignoreState } from "./finding-ignore.js";

export type IndexCandidates = {
  rows: any[];
  truncated: boolean;
  assessedRevisions?: number;
  incompleteHealth?: boolean;
  inspectionOnly?: boolean;
};
export type IndexReference = {
  id: string;
  metadata: Omit<IndexCandidates, "rows">;
};
export type IndexFilters = {
  category: string;
  severity: string;
  search: string;
  triage: string;
  kind: string;
  page: number;
  pageSize: number;
};
const categoryRules: Record<string, RegExp> = {
  security: /^(?:security\.(?!hotspots$)|secrets\.|iac\.)/,
  reliability: /^quality\.reliability$/,
  maintainability: /^quality\.maintainability$/,
  duplication: /^quality\.duplication$/,
  hotspot: /^security\.hotspots$/,
  coverage: /^tests\.coverage$/,
};

/** Durable derived rows, never authorization or a replacement for source evidence.
 * Call ensure under the source-revision transaction; readers only fetch one page.
 * Decision joins stay live, including ignores that expire without a write. */
export class FindingIndex {
  constructor(private readonly db: PrismaService | Prisma.TransactionClient) {}
  async ensure(
    id: string,
    organizationId: string,
    scopeKey: string,
    build: () => Promise<IndexCandidates>,
  ): Promise<IndexReference> {
    const saved = await this.db.findingIndexSnapshot.findUnique({
      where: { id },
    });
    if (saved)
      return { id, metadata: saved.metadata as IndexReference["metadata"] };
    // Claim the key before normalization. A competing repeatable-read
    // transaction retries its unique-key conflict before decoding any reports.
    // The placeholder and completed rows commit atomically.
    await this.db.findingIndexSnapshot.create({
      data: { id, organizationId, scopeKey, metadata: {} },
    });
    const { rows, ...metadata } = await build();
    await this.db.findingIndexSnapshot.update({
      where: { id },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
    // Bound parameter count and payload size; full reasoning/source never enter
    // the list index. Details still resolve the authorized original assessment.
    for (let offset = 0; offset < rows.length; offset += 100) {
      await this.db.findingIndexRow.createMany({
        data: rows.slice(offset, offset + 100).map((row, n) => {
          const {
            review: _review,
            guidance: _g,
            reportGuidance: _r,
            referenceGuidance: _ref,
            aiReview: _ai,
            ...data
          } = row;
          const categories = [row.category];
          if (["check", "evidence"].includes(row.category))
            for (const [category, rule] of Object.entries(categoryRules))
              if (rule.test(row.ruleId ?? "")) categories.push(category);
          return {
            snapshotId: id,
            id: row.id,
            ordinal: offset + n,
            repositoryId: row.repositoryId,
            sourceSha: row.sourceSha,
            origin: row.origin ?? "ci",
            category: row.category,
            categories,
            severity: row.severity,
            status: row.status,
            ruleId: row.ruleId ?? null,
            checkTitle: row.checkTitle ?? null,
            pullRequest: row.pullRequest ?? null,
            ignoreId: findingIgnoreId(organizationId, row),
            searchText:
              `${row.title} ${row.recommendation ?? ""} ${row.repository} ${row.sourceSha} ${row.pullRequest ?? ""} ${row.ruleId ?? ""} ${row.path ?? ""} ${row.checkTitle ?? ""} ${(row.evidenceLocations ?? []).map((e: any) => e.path ?? e.label).join(" ")}`.toLowerCase(),
            data: JSON.parse(JSON.stringify(data)),
          };
        }),
      });
    }
    // Superseded indexes are disposable, unlike source reports or audit records.
    // Keep a day for in-flight readers; unchanged indexes remain reusable forever.
    await this.db.findingIndexSnapshot.deleteMany({
      where: {
        organizationId,
        scopeKey,
        id: { not: id },
        createdAt: { lt: new Date(Date.now() - 86400000) },
      },
    });
    return { id, metadata };
  }
  async list(
    reference: IndexReference,
    organizationId: string,
    filters: IndexFilters,
    aiOnly: boolean,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await (this.db as PrismaService).$transaction(
          (tx) => this.read(tx, reference, organizationId, filters, aiOnly),
          { isolationLevel: "RepeatableRead", timeout: 15000 },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !["P2034", "P2002"].includes(error.code)
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            "Findings changed while loading. Refresh and try again.",
          );
      }
    }
    throw new ConflictException(
      "Findings changed while loading. Refresh and try again.",
    );
  }
  private async read(
    tx: Prisma.TransactionClient,
    reference: IndexReference,
    organizationId: string,
    f: IndexFilters,
    aiOnly: boolean,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "FindingIndexSnapshot" WHERE id=${reference.id} AND "organizationId"=${organizationId} FOR SHARE`,
    );
    if (!locked.length)
      throw new ConflictException(
        "Findings changed while loading. Refresh and try again.",
      );
    const joins = Prisma.sql`FROM "FindingIndexRow" r
   LEFT JOIN "FindingDisposition" d ON d."organizationId"=${organizationId} AND d.id=r.id AND d."sourceSha"=r."sourceSha" AND r.origin IN ('ci','ai')
   LEFT JOIN "FindingIgnore" i ON i."organizationId"=${organizationId} AND i.id=r."ignoreId"
   WHERE r."snapshotId"=${reference.id} AND EXISTS (SELECT 1 FROM "FindingIndexSnapshot" s WHERE s.id=r."snapshotId" AND s."organizationId"=${organizationId})`;
    const activeIgnore = Prisma.sql`(i.state='IGNORED' AND (i."expiresAt" IS NULL OR i."expiresAt">CURRENT_TIMESTAMP))`;
    const [decisions] = await tx.$queryRaw<{ key: string; at: Date }[]>(
      Prisma.sql`SELECT md5(COALESCE(string_agg(concat_ws(':',r.id,d.revision,d.state,i.revision,i.state,${activeIgnore}),',' ORDER BY r.id),'')) AS key, CURRENT_TIMESTAMP AS at ${joins}`,
    );
    const key = digest({
      version: 1,
      category: f.category,
      severity: f.severity,
      search: f.search,
      triage: f.triage,
      kind: f.kind,
      decisions: decisions.key,
    });
    const matching = Prisma.sql`WITH matching AS (
   SELECT r.*, CASE WHEN ${activeIgnore} THEN 'Ignored' ELSE r.status END AS "effectiveStatus",
    COALESCE(d.state,'REPORTED') AS "triageState", to_jsonb(d) AS disposition, to_jsonb(i) AS "ignoreDecision"
   ${joins}
    AND (${f.severity}='all' OR r.severity=${f.severity})
    AND (${f.category}='all' OR r.categories @> ARRAY[${f.category}]::text[])
    AND (${f.search}='' OR strpos(r."searchText",${f.search})>0)
    AND (${f.triage}='all' OR (${f.triage}='IGNORED' AND ${activeIgnore}) OR
      (${f.triage}<>'IGNORED' AND NOT COALESCE(${activeIgnore},false) AND COALESCE(d.state,'REPORTED')=${f.triage}))
  )`;
    const cached = await tx.findingIndexSummary.findUnique({
      where: {
        snapshotId_filterKey: { snapshotId: reference.id, filterKey: key },
      },
    });
    let stats: any = cached?.data;
    if (!stats) {
      const groups = await tx.$queryRaw<any[]>(
        Prisma.sql`${matching} SELECT "repositoryId",category,severity,"effectiveStatus" AS status,"ruleId","checkTitle","pullRequest",count(*)::int AS count FROM matching GROUP BY "repositoryId",category,severity,"effectiveStatus","ruleId","checkTitle","pullRequest"`,
      );
      stats = summarizeGroups(groups, f.kind, aiOnly);
      if (aiOnly && f.kind === "gaps")
        stats.summary = summarizeGroups([], "gaps", false).summary;
      await tx.findingIndexSummary.createMany({
        data: [{ snapshotId: reference.id, filterKey: key, data: stats }],
        skipDuplicates: true,
      });
      // Per-index filter summaries are disposable and bounded; expiry/decision
      // changes generate a new key, never a stale summary.
      const obsolete = await tx.findingIndexSummary.findMany({
        where: { snapshotId: reference.id },
        orderBy: [{ createdAt: "desc" }, { filterKey: "asc" }],
        skip: 64,
        select: { filterKey: true },
      });
      if (obsolete.length)
        await tx.findingIndexSummary.deleteMany({
          where: {
            snapshotId: reference.id,
            filterKey: { in: obsolete.map((s) => s.filterKey) },
          },
        });
    }
    const page = await tx.$queryRaw<any[]>(
      Prisma.sql`${matching} SELECT data,disposition,"ignoreDecision","effectiveStatus" AS status FROM matching WHERE (category='evidence')=${f.kind === "gaps"} ORDER BY ordinal LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
    );
    return {
      ...stats,
      ...reference.metadata,
      rows:
        aiOnly && f.kind === "gaps"
          ? []
          : page.map((item) => {
              const saved = item.disposition;
              return {
                ...item.data,
                status: item.status,
                triage: saved
                  ? {
                      state: saved.state,
                      assigneeId: saved.assigneeId,
                      note: saved.note,
                      revision: saved.revision,
                      updatedAt: saved.updatedAt,
                    }
                  : {
                      state: "REPORTED",
                      assigneeId: null,
                      note: "",
                      revision: 0,
                    },
                ignore: ignoreState(
                  item.ignoreDecision,
                  new Date(decisions.at),
                ),
              };
            }),
      page: f.page,
      pageSize: f.pageSize,
    };
  }
}

function summarizeGroups(groups: any[], kind: string, aiOnly: boolean) {
  const active = groups.filter(
      (g) => !["Suppressed", "Ignored"].includes(g.status),
    ),
    issues = active.filter((g) => g.category !== "evidence"),
    gaps = active.filter((g) => g.category === "evidence");
  const sum = (rows: any[]) => rows.reduce((n, g) => n + g.count, 0),
    charts = kind === "gaps" ? gaps : issues;
  const checks = new Map<string, number>();
  for (const row of charts) {
    const name =
      (row.category === "ai" ? (row.checkTitle ?? "AI review") : row.ruleId) ??
      (row.category === "evidence" ? "Missing evidence" : "Unspecified check");
    checks.set(name, (checks.get(name) ?? 0) + row.count);
  }
  const sorted = [...checks].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
    byCheck = sorted.slice(0, 8).map(([name, count]) => ({ name, count }));
  if (sorted.length > 8)
    byCheck.push({
      name: "Other checks",
      count: sorted.slice(8).reduce((n, g) => n + g[1], 0),
    });
  const summary = {
    reportedIssues: sum(issues),
    affectedRepositories: new Set(active.map((g) => g.repositoryId)).size,
    criticalHigh: sum(
      issues.filter((g) => ["critical", "high"].includes(g.severity)),
    ),
    evidenceGaps: sum(gaps),
    suppressed: sum(groups.filter((g) => g.status === "Suppressed")),
    ignored: sum(groups.filter((g) => g.status === "Ignored")),
    bySeverity: ["critical", "high", "medium", "low", "unknown"].map(
      (name) => ({
        name,
        count: sum(charts.filter((g) => g.severity === name)),
      }),
    ),
    byCheck,
    chartTotal: sum(charts),
  };
  return {
    summary,
    total: sum(
      groups.filter((g) => (g.category === "evidence") === (kind === "gaps")),
    ),
    ...(aiOnly
      ? {
          aiSummary: {
            suggestions: sum(groups),
            repositories: new Set(groups.map((g) => g.repositoryId)).size,
            pullRequests: new Set(
              groups.map((g) => `${g.repositoryId}:${g.pullRequest}`),
            ).size,
          },
        }
      : {}),
  };
}
