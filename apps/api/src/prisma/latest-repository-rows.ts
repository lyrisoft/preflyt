import { Prisma } from '../generated/prisma/client.js'
import type { PrismaService } from './prisma.service.js'

type Table = 'RepositoryProfile' | 'CommitAssessment' | 'RepositoryStandardsSelection'
/** PostgreSQL limits each indexed lookup before Prisma loads JSON bodies. */
export async function latestRepositoryIds(
  db: Pick<PrismaService, '$queryRaw'>,
  table: Table,
  repositoryIds: string[],
  where: Prisma.Sql = Prisma.sql`TRUE`,
) {
  if (!repositoryIds.length) return []
  const order =
    table === 'RepositoryStandardsSelection'
      ? Prisma.sql`revision DESC, id DESC`
      : Prisma.sql`"createdAt" DESC, id DESC`
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT latest.id FROM unnest(ARRAY[${Prisma.join(repositoryIds)}]::text[]) wanted(id)
    CROSS JOIN LATERAL (
      SELECT id FROM ${Prisma.raw('"' + table + '"')} item
      WHERE item."repositoryId" = wanted.id AND ${where}
      ORDER BY ${order} LIMIT 1
    ) latest`)
  return rows.map((row) => row.id)
}
