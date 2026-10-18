import type { PrismaService } from '../prisma/prisma.service.js'

/** Request-local reader for the existing verifier; never used to authorize writes. */
export async function teamContextReader(db: PrismaService, contexts: unknown[]) {
  const sources = contexts.flatMap((value) => (Array.isArray(value) ? value : []))
  let pending = [
    ...new Set(
      sources.flatMap((source) => (typeof source?.teamId === 'string' ? [source.teamId] : [])),
    ),
  ]
  const teams: Awaited<ReturnType<typeof db.preflytTeam.findMany>> = []
  const seen = new Set<string>()
  for (let depth = 0; pending.length && depth < 9; depth++) {
    const batch = pending.filter((id) => !seen.has(id))
    batch.forEach((id) => seen.add(id))
    if (!batch.length) break
    const rows = await db.preflytTeam.findMany({ where: { id: { in: batch } } })
    teams.push(...rows)
    pending = rows.flatMap((row) =>
      Array.isArray(row.nestedScope)
        ? row.nestedScope.flatMap((child) =>
            child &&
            typeof child === 'object' &&
            !Array.isArray(child) &&
            typeof child.teamId === 'string'
              ? [child.teamId]
              : [],
          )
        : [],
    )
  }
  const [scopes, assignments] = await Promise.all([
    db.teamRepositoryScope.findMany({
      where: { teamId: { in: teams.map((t) => t.id) } },
      orderBy: { repositoryId: 'asc' },
    }),
    db.teamPolicyAssignment.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              sources.flatMap((source) =>
                typeof source?.assignmentId === 'string' ? [source.assignmentId] : [],
              ),
            ),
          ],
        },
      },
    }),
  ])
  return {
    preflytTeam: {
      findFirst: async ({ where }: any) =>
        teams.find(
          (team) =>
            team.id === where.id &&
            team.organizationId === where.organizationId &&
            (where.scopeRevision === undefined || team.scopeRevision === where.scopeRevision) &&
            (!where.repositories?.some ||
              scopes.some(
                (scope) =>
                  scope.teamId === team.id &&
                  scope.repositoryId === where.repositories.some.repositoryId &&
                  scope.policyScopeEnabled &&
                  scope.providerPresent,
              )),
        ) ?? null,
    },
    teamPolicyAssignment: {
      findFirst: async ({ where }: any) =>
        assignments.find(
          (a) =>
            a.id === where.id &&
            a.teamId === where.teamId &&
            a.digest === where.digest &&
            a.supersededAt === null,
        ) ?? null,
    },
    teamRepositoryScope: {
      findMany: async ({ where, take }: any) =>
        scopes
          .filter(
            (scope) =>
              scope.teamId === where.teamId &&
              (where.policyScopeEnabled === undefined ||
                scope.policyScopeEnabled === where.policyScopeEnabled) &&
              (where.providerPresent === undefined ||
                scope.providerPresent === where.providerPresent),
          )
          .slice(0, take ?? scopes.length),
    },
  } as unknown as Pick<
    PrismaService,
    'preflytTeam' | 'teamPolicyAssignment' | 'teamRepositoryScope'
  >
}
