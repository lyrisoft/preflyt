import { BadRequestException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { comparableFindingScope, type HealthReport, type HealthFinding } from './health-report.js'

/** Project saved JSON in PostgreSQL; full finding bodies never cross the DB connection here. */
export async function healthSummaries(db: PrismaService, organizationId: string, ids: string[]) {
 if (!ids.length) return new Map<string, HealthReport | null>()
 const rows = await db.$queryRaw<Array<{id: string; report: HealthReport | null}>>(Prisma.sql`
  SELECT h.id, CASE WHEN jsonb_typeof(h.report) = 'object' THEN
   (h.report - 'findings' - 'paymentRiskReport') || jsonb_build_object('findings', '[]'::jsonb, 'findingSummary',
    jsonb_build_object('total', s.total, 'unsuppressed', s.unsuppressed, 'analyzerHigh', s.high,
     'groups', COALESCE(g.groups, '[]'::jsonb))) ELSE NULL END AS report
  FROM "RepositoryHealthAssessment" h
  CROSS JOIN LATERAL (
   SELECT count(*)::int AS total,
    count(*) FILTER (WHERE f->>'suppressed' IS DISTINCT FROM 'true')::int AS unsuppressed,
    count(*) FILTER (WHERE f->>'suppressed' IS DISTINCT FROM 'true' AND f->>'evidence' IS DISTINCT FROM 'AI_REPORTED'
      AND f->>'severity' IN ('critical', 'high'))::int AS high
   FROM jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f
  ) s
  CROSS JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('category', category, 'checkId', check_id, 'severity', severity, 'count', n)) AS groups
   FROM (SELECT f->>'category' AS category, f->>'checkId' AS check_id, f->>'severity' AS severity, count(*)::int AS n
    FROM jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f GROUP BY 1,2,3) counts
  ) g
  WHERE h."organizationId" = ${organizationId} AND h.id IN (${Prisma.join([...new Set(ids)])})
 `)
 return new Map(rows.map(row => [row.id, row.report]))
}

export async function healthTrend(db: PrismaService, organizationId: string, current: {id: string; report: HealthReport | null}, prior?: {id: string; report: HealthReport | null} | null) {
 if (!current.report || !prior?.report || current.report.completeness !== 'COMPLETE' || prior.report.completeness !== 'COMPLETE') return null
 const scope = comparableFindingScope(current.report, prior.report)
 if (scope === null) return null
 const scopeFilter = scope.length ? Prisma.sql`AND f->>'checkId' IN (${Prisma.join(scope)})` : Prisma.empty
 const [trend] = await db.$queryRaw<Array<{introduced: number; noLongerReported: number}>>(Prisma.sql`
  WITH fingerprints AS (
   SELECT h.id, f->>'fingerprint' AS fingerprint FROM "RepositoryHealthAssessment" h,
    LATERAL jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f
   WHERE h."organizationId" = ${organizationId} AND h.id IN (${current.id}, ${prior.id}) ${scopeFilter}
  )
  SELECT (SELECT count(*)::int FROM (SELECT fingerprint FROM fingerprints WHERE id = ${current.id}
   EXCEPT SELECT fingerprint FROM fingerprints WHERE id = ${prior.id}) added) AS introduced,
   (SELECT count(*)::int FROM (SELECT fingerprint FROM fingerprints WHERE id = ${prior.id}
   EXCEPT SELECT fingerprint FROM fingerprints WHERE id = ${current.id}) removed) AS "noLongerReported"
 `)
 return {...trend!, ...(scope.length ? {checkIds: scope} : {})}
}

export async function healthHotspots(db: PrismaService, organizationId: string, id: string) {
 return db.$queryRaw<Array<{fingerprint: string}>>(Prisma.sql`
  SELECT f->>'fingerprint' AS fingerprint FROM "RepositoryHealthAssessment" h,
   LATERAL jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f
  WHERE h."organizationId" = ${organizationId} AND h.id = ${id} AND f->>'category' = 'hotspot'
 `)
}

export async function healthFinding(db: PrismaService, organizationId: string, id: string, fingerprint: string) {
 const [row] = await db.$queryRaw<Array<{finding: HealthFinding}>>(Prisma.sql`
  SELECT f AS finding FROM "RepositoryHealthAssessment" h,
   LATERAL jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) f
  WHERE h."organizationId" = ${organizationId} AND h.id = ${id} AND f->>'fingerprint' = ${fingerprint} LIMIT 1
 `)
 return row?.finding
}

export function healthFindingsFilters(input: {page?: string; pageSize?: string; q?: string; severity?: string; reports?:string}) {
 if (Object.values(input).some(value => value !== undefined && typeof value !== 'string')) throw new BadRequestException('Choose valid findings filters')
 const page = input.page === undefined ? 1 : Number(input.page)
 const pageSize = input.pageSize === undefined ? 10 : Number(input.pageSize)
 const search = (input.q ?? '').trim().toLowerCase()
 const severity = input.severity ?? 'all'
 const reports=input.reports?.split(',')
 if(reports && (reports.length>2 || new Set(reports).size!==reports.length || reports.some(id=>!/^[a-f0-9-]{36}$/.test(id))))throw new BadRequestException('Choose valid findings reports')
 if (!Number.isInteger(page) || page < 1 || page > 10000 || ![10,25,50,100].includes(pageSize) ||
  search.length > 200 || !['all','critical','high','medium','low','unknown'].includes(severity))
  throw new BadRequestException('Choose valid findings filters')
 return {page, pageSize, search, severity, reports}
}

export async function healthFindingsPage(db: PrismaService, organizationId: string, id: string | string[], filters: ReturnType<typeof healthFindingsFilters>) {
 const {page, pageSize, search, severity} = filters
 const [result] = await db.$queryRaw<Array<{rows: (HealthFinding & {assessmentId:string;assessedAt:string|null})[]; total: number; unfilteredTotal:number}>>(Prisma.sql`
  WITH available AS (
   SELECT f, position, h.id AS "assessmentId", h."finishedAt" FROM "RepositoryHealthAssessment" h,
    LATERAL jsonb_array_elements(COALESCE(h.report->'findings', '[]'::jsonb)) WITH ORDINALITY AS entries(f, position)
   WHERE h."organizationId" = ${organizationId} AND h.id IN (${Prisma.join(Array.isArray(id)?id:[id])})
  ), matching AS (SELECT * FROM available WHERE (${severity} = 'all' OR f->>'severity' = ${severity})
    AND (${search} = '' OR strpos(lower(concat(f->>'title', ' ', f->>'path', ' ', f->>'ruleId')), ${search}) > 0)
  ), page AS (SELECT * FROM matching ORDER BY "assessmentId",position LIMIT ${pageSize} OFFSET ${(page-1)*pageSize})
  SELECT (SELECT count(*)::int FROM matching) AS total, (SELECT count(*)::int FROM available) AS "unfilteredTotal",
   COALESCE((SELECT jsonb_agg(jsonb_build_object('assessmentId', "assessmentId", 'assessedAt', "finishedAt", 'fingerprint', f->'fingerprint', 'category', f->'category',
    'severity', f->'severity', 'title', f->'title', 'ruleId', f->'ruleId', 'path', f->'path',
    'line', f->'line', 'endLine', f->'endLine', 'checkId', f->'checkId', 'evidence', f->'evidence') ORDER BY "assessmentId",position) FROM page), '[]'::jsonb) AS rows
 `)
 return {...result!, page, pageSize}
}
