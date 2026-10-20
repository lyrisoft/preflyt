import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { digest } from "../assessments/assessment-digest.js";
import {
  healthAnalyses,
  type HealthReport,
  healthTimeline,
} from "./health-report.js";

const categories = ["security", "reliability", "maintainability"] as const;
type Category = (typeof categories)[number];
type Point = ReturnType<typeof healthTimeline>[number];
type Timeline = Array<
  Omit<Point, "categories"> & {
    categories: Partial<{ [K in Category]: Point["categories"]["security"] }>;
  }
>;
type Record = { id: string; state: string; report: HealthReport | null };
export type Remediation = {
  status: "COMPARED" | "BASELINE" | "PARTIAL" | "SCOPE_CHANGED" | "AI_REVIEW";
  previousAssessmentId?: string;
  previousSourceSha?: string;
  introduced?: number;
  noLongerReported?: number;
  remaining?: number;
};

/** A smaller or failed scan must never establish that an earlier issue disappeared. */
function scope(report: HealthReport, category: Category) {
  if (
    report.mode !== "EXECUTED" ||
    report.completeness !== "COMPLETE" ||
    !report.inspection.complete
  )
    return null;
  const checks = report.analyses.filter((a) =>
    healthAnalyses.some((def) => def.id === a.id && def.category === category),
  );
  if (
    !checks.length ||
    checks.some(
      (a) =>
        !["PASS", "FAIL"].includes(a.state) ||
        !/^[a-f0-9]{64}$/.test(a.reportHash ?? "") ||
        !a.tool ||
        !/^[a-f0-9]{64}$/.test(a.configHash ?? "") ||
        !Number.isSafeInteger(a.findingsRetained) ||
        a.findingsRetained! < 0 ||
        a.findingsReported !== a.findingsRetained ||
        (a.findingsSuppressed ?? 0) !== 0 ||
        a.scanErrors?.length ||
        (a.fileAnalysis && a.fileAnalysis.skippedFiles !== 0),
    )
  )
    return null;
  return {
    checkIds: checks.map((a) => a.id).sort(),
    key: digest({
      comparisonKey: report.comparisonKey,
      selection: report.selection ?? "all",
      checks: checks
        .map((a) => ({
          id: a.id,
          tool: a.tool,
          configHash: a.configHash,
          files: a.fileAnalysis ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }),
  };
}

export function remediationPlan(points: Timeline, records: Record[]) {
  const reports = new Map(records.map((row) => [row.id, row]));
  const baselines = new Map<
    Category,
    { id: string; sourceSha: string; key: string }
  >();
  const plans: Array<{
    id: string;
    category: Category;
    remediation: Remediation;
    checkIds?: string[];
  }> = [];
  for (const point of points)
    for (const category of categories) {
      if (!point.categories[category]) continue;
      const row = reports.get(point.id),
        report = row?.report;
      if (!report) continue;
      let remediation: Remediation;
      if (point.scope === "ai") remediation = { status: "AI_REVIEW" };
      else {
        const current =
          row.state === "COMPLETED" ? scope(report, category) : null;
        const previous = baselines.get(category);
        if (!current) remediation = { status: "PARTIAL" };
        else {
          remediation = !previous
            ? { status: "BASELINE" }
            : previous.key !== current.key
              ? { status: "SCOPE_CHANGED" }
              : {
                  status: "COMPARED",
                  previousAssessmentId: previous.id,
                  previousSourceSha: previous.sourceSha,
                };
          baselines.set(category, {
            id: point.id,
            sourceSha: point.sourceSha,
            key: current.key,
          });
          plans.push({
            id: point.id,
            category,
            remediation,
            checkIds: current.checkIds,
          });
          continue;
        }
      }
      plans.push({ id: point.id, category, remediation });
    }
  return plans;
}

/** Only identity sets cross the SQL comparison; report bodies stay in PostgreSQL. */
export async function healthRemediation(
  db: PrismaService,
  organizationId: string,
  points: Timeline,
  records: Record[],
) {
  const plans = remediationPlan(points, records);
  const comparisons = plans.filter(
    (plan) => plan.remediation.status === "COMPARED",
  );
  const counts = comparisons.length
    ? await db.$queryRaw<
        Array<{
          id: string;
          category: Category;
          introduced: number;
          noLongerReported: number;
          remaining: number;
        }>
      >(Prisma.sql`
    WITH requested AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(comparisons.map((plan) => ({ id: plan.id, category: plan.category, previous: plan.remediation.previousAssessmentId, checks: plan.checkIds })))}::jsonb)
        AS p(id text, category text, previous text, checks jsonb)
    ), pairs AS (
      SELECT p.* FROM requested p
      JOIN "RepositoryHealthAssessment" current ON current.id=p.id AND current."organizationId"=${organizationId}
      JOIN "RepositoryHealthAssessment" previous ON previous.id=p.previous AND previous."organizationId"=${organizationId}
        AND previous."repositoryId"=current."repositoryId" AND previous.branch=current.branch
    ), identities AS (
      SELECT DISTINCT p.id, p.category, h.id AS assessment, f->>'fingerprint' AS fingerprint
      FROM pairs p JOIN "RepositoryHealthAssessment" h ON h.id IN (p.id, p.previous)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f
      WHERE h."organizationId" = ${organizationId} AND f->>'category' = p.category
        AND p.checks ? (f->>'checkId') AND f->>'fingerprint' IS NOT NULL
        AND f->>'suppressed' IS DISTINCT FROM 'true' AND f->>'evidence' IS DISTINCT FROM 'AI_REPORTED'
    )
    SELECT p.id, p.category,
      (SELECT count(*)::int FROM (SELECT fingerprint FROM identities WHERE id=p.id AND category=p.category AND assessment=p.id
        EXCEPT SELECT fingerprint FROM identities WHERE id=p.id AND category=p.category AND assessment=p.previous) added) AS introduced,
      (SELECT count(*)::int FROM (SELECT fingerprint FROM identities WHERE id=p.id AND category=p.category AND assessment=p.previous
        EXCEPT SELECT fingerprint FROM identities WHERE id=p.id AND category=p.category AND assessment=p.id) removed) AS "noLongerReported",
      (SELECT count(*)::int FROM identities WHERE id=p.id AND category=p.category AND assessment=p.id) AS remaining
    FROM pairs p
  `)
    : [];
  const byPoint = new Map(
    counts.map((row) => [row.id + ":" + row.category, row]),
  );
  const byPlan = new Map(
    plans.map((plan) => {
      const count = byPoint.get(plan.id + ":" + plan.category);
      return [
        plan.id + ":" + plan.category,
        count
          ? {
              ...plan.remediation,
              introduced: count.introduced,
              noLongerReported: count.noLongerReported,
              remaining: count.remaining,
            }
          : plan.remediation.status === "COMPARED"
            ? { status: "PARTIAL" as const }
            : plan.remediation,
      ];
    }),
  );
  return points.map((point) => ({
    ...point,
    categories: Object.fromEntries(
      categories.map((category) => [
        category,
        point.categories[category]
          ? {
              ...point.categories[category],
              remediation: byPlan.get(point.id + ":" + category),
            }
          : null,
      ]),
    ),
  }));
}
