import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { healthSummaries } from "../health/health-read.js";
import { healthTimeline } from "../health/health-report.js";
import { healthRemediation } from "../health/health-remediation.js";
import { overallHealth } from "../health/health-overall.js";

export type DigestRepository = {
  githubId: string;
  name: string;
  branch: string;
  assessmentId: string | null;
  assessedAt: string | null;
  sourceSha: string | null;
  status: string;
  incomplete: boolean;
  noNewAssessment: boolean;
  findingsAvailable?: boolean;
  severities: Record<string, number>;
  changes: Array<{
    category: string;
    introduced: number;
    noLongerReported: number;
    remaining: number;
  }>;
};
export async function weeklyHealthRepository(
  db: PrismaService,
  organizationId: string,
  repository: {
    id: string;
    githubId: bigint;
    fullName: string;
    defaultBranch: string | null;
  },
  periodStart: Date,
  cutoff: Date,
): Promise<DigestRepository> {
  const target = await db.repositoryHealthTarget.findUnique({
    where: { repositoryId: repository.id },
  });
  const branch = target?.branch ?? repository.defaultBranch ?? "main";
  const where = {
    organizationId,
    repositoryId: repository.id,
    branch,
    parentId: null,
    strixRun: { is: null },
    state: { in: ["COMPLETED", "FAILED"] },
    finishedAt: { lte: cutoff },
  };
  const latest = await db.repositoryHealthAssessment.findFirst({
    where,
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    omit: { report: true },
  });
  const base: DigestRepository = {
    githubId: String(repository.githubId),
    name: repository.fullName,
    branch,
    assessmentId: latest?.id ?? null,
    assessedAt: latest?.finishedAt?.toISOString() ?? null,
    sourceSha: latest?.sourceSha ?? null,
    status: "NOT_ASSESSED",
    findingsAvailable: false,
    incomplete: true,
    noNewAssessment: !latest?.finishedAt || latest.finishedAt <= periodStart,
    severities: {},
    changes: [],
  };
  if (!latest) return base;
  // Search outside the chart's bounded recent history. Partial scans never replace this baseline.
  const previous = await db.repositoryHealthAssessment.findFirst({
    where: {
      ...where,
      state: "COMPLETED",
      finishedAt: { lte: periodStart },
      report: { path: ["completeness"], equals: "COMPLETE" },
    },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    omit: { report: true },
  });
  const rows =
    previous && previous.id !== latest.id ? [previous, latest] : [latest];
  const summaries = await healthSummaries(
    db,
    organizationId,
    rows.map((row) => row.id),
  );
  const records = rows.map((row) => ({
    ...row,
    report: summaries.get(row.id) ?? null,
  }));
  const report = summaries.get(latest.id) ?? null;
  const incomplete =
    latest.state !== "COMPLETED" ||
    !report ||
    report.mode !== "EXECUTED" ||
    report.completeness !== "COMPLETE" ||
    !report.inspection.complete ||
    (!!report.selection && report.selection !== "all") ||
    !report.analyses.length ||
    report.analyses.some(
      (a) =>
        !["PASS", "FAIL"].includes(a.state) ||
        a.findingsRetained === undefined ||
        a.findingsReported !== a.findingsRetained,
    );
  const timeline = await healthRemediation(
    db,
    organizationId,
    healthTimeline(report, records),
    records,
  );
  const point = timeline.find((row) => row.id === latest.id);
  const changes =
    !base.noNewAssessment && !incomplete
      ? Object.entries(point?.categories ?? {}).flatMap(([category, value]) => {
          const change = value?.remediation;
          return change?.status === "COMPARED" &&
            change.remaining !== undefined &&
            change.introduced !== undefined &&
            change.noLongerReported !== undefined
            ? [
                {
                  category,
                  introduced: change.introduced,
                  noLongerReported: change.noLongerReported,
                  remaining: change.remaining,
                },
              ]
            : [];
        })
      : [];
  const counts = await db.$queryRaw<
    Array<{ severity: string; count: number }>
  >(Prisma.sql`
    SELECT CASE WHEN f->>'severity' IN ('critical','high','medium','low') THEN f->>'severity' ELSE 'unknown' END AS severity, count(*)::int AS count
    FROM "RepositoryHealthAssessment" h CROSS JOIN LATERAL jsonb_array_elements(COALESCE(h.report->'findings','[]'::jsonb)) f
    WHERE h.id=${latest.id} AND h."organizationId"=${organizationId}
      AND f->>'suppressed' IS DISTINCT FROM 'true' AND f->>'evidence' IS DISTINCT FROM 'AI_REPORTED'
    GROUP BY 1`);
  return {
    ...base,
    findingsAvailable:
      !!report &&
      report.mode === "EXECUTED" &&
      report.analyses.some(
        (a) => Number.isSafeInteger(a.findingsRetained) && !!a.reportHash,
      ),
    status: overallHealth(report, latest.state).status,
    incomplete,
    severities: Object.fromEntries(
      counts.map((row) => [row.severity, row.count]),
    ),
    changes,
  };
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function weeklyHealthTemplate(
  origin: string,
  week: string,
  repositories: DigestRepository[],
) {
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("SMTP_CONFIGURATION_INVALID");
  const root = url.origin;
  const blocks = repositories.map((repo) => {
    const status = repo.status.toLowerCase().replaceAll("_", " ");
    const findings =
      repo.assessmentId && repo.findingsAvailable === false
        ? "Verified finding counts are unavailable."
        : repo.assessmentId
          ? `${repo.incomplete ? "Reported findings (incomplete coverage)" : "Reported findings"}: ` +
            ["critical", "high", "medium", "low", "unknown"]
              .map((s) => `${s}: ${repo.severities[s] ?? 0}`)
              .join(" · ")
          : "No saved assessment";
    const changes = repo.changes.length
      ? repo.changes
          .map(
            (c) =>
              `${c.category}: ${c.remaining} remaining, ${c.introduced} new, ${c.noLongerReported} no longer reported`,
          )
          .join("\n")
      : "Changes unavailable: no new complete, comparable assessment. Partial scans never count as fixes.";
    const url = `${root}/repositories/${repo.githubId}?tab=health${repo.assessmentId ? `&health=${encodeURIComponent(repo.assessmentId)}` : ""}`;
    const lines = [
      repo.name,
      `${repo.branch} · ${status}${repo.incomplete ? " · Incomplete coverage" : ""}`,
      repo.assessedAt
        ? `Last assessed ${repo.assessedAt} · ${repo.sourceSha?.slice(0, 12) ?? "commit unavailable"}`
        : "No assessment available",
      ...(repo.noNewAssessment ? ["No new assessment this week."] : []),
      findings,
      changes,
    ];
    return {
      text: `${lines.join("\n")}\nView repository health: ${url}`,
      html: `<section style="border-top:1px solid #dce3e8;padding:20px 0"><h2 style="font-size:18px">${escape(repo.name)}</h2>${lines
        .slice(1)
        .map((line) => `<p>${escape(line).replaceAll("\n", "<br>")}</p>`)
        .join(
          "",
        )}<a href="${escape(url)}">View repository health</a></section>`,
    };
  });
  const intro = `Weekly repository health · week of ${week}. Saved assessments only; repository changes since the last assessment may not be reflected.`;
  const footer = `Manage your weekly email and repository selection: ${root}/notifications`;
  return {
    subject: "Your weekly Preflyt repository health",
    text: `${intro}\n\n${blocks.map((b) => b.text).join("\n\n")}\n\n${footer}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;color:#172b3a;margin:0;padding:24px"><main style="max-width:640px;margin:auto"><h1 style="font-size:24px">Your weekly repository health</h1><p>${escape(intro)}</p>${blocks.map((b) => b.html).join("")}<p><a href="${root}/notifications">Manage weekly email preferences</a></p></main></body></html>`,
  };
}
