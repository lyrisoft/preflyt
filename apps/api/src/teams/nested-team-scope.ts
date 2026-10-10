import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import { digest } from "../assessments/assessment-digest.js";

type Db = Pick<PrismaService, "preflytTeam" | "teamRepositoryScope">;
export type NestedSource = {
  teamId: string;
  revision: number;
  fingerprint: string;
  repositoryIds: string[];
};
export function nestedSources(value: unknown): NestedSource[] {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    value.some(
      (v) =>
        !v ||
        typeof v.teamId !== "string" ||
        !Number.isInteger(v.revision) ||
        !/^[a-f0-9]{64}$/.test(v.fingerprint ?? "") ||
        !Array.isArray(v.repositoryIds) ||
        v.repositoryIds.length > 100 ||
        v.repositoryIds.some((id: unknown) => typeof id !== "string"),
    ) ||
    new Set(value.map((v) => v.teamId)).size !== value.length
  )
    throw new ConflictException("Child team scope could not be verified");
  return value;
}
export async function nestedSnapshot(
  db: Db,
  id: string,
  organizationId: string,
  path: string[] = [],
  count = { value: 0 },
): Promise<NestedSource> {
  if (path.includes(id) || path.length >= 8 || ++count.value > 100)
    throw new ConflictException(
      "Child team scope contains a cycle or exceeds the nesting limit",
    );
  const team = await db.preflytTeam.findFirst({
    where: { id, organizationId },
  });
  if (!team || team.source === "ORGANIZATION")
    throw new ConflictException("Choose a team in this organization");
  if (
    team.source === "GITHUB" &&
    (team.syncState !== "SYNCED" ||
      !team.syncedAt ||
      Date.now() - team.syncedAt.getTime() > 86400000)
  )
    throw new ConflictException(
      "Sync the GitHub child team before reviewing its scope",
    );
  for (const child of nestedSources(team.nestedScope ?? [])) {
    const actual = await nestedSnapshot(
      db,
      child.teamId,
      organizationId,
      [...path, id],
      count,
    );
    if (digest(actual) !== digest(child))
      throw new ConflictException(
        "Child team scope changed. Review and approve it again before publishing",
      );
  }
  const scopes = await db.teamRepositoryScope.findMany({
    where: { teamId: id, policyScopeEnabled: true },
    orderBy: { repositoryId: "asc" },
    take: 101,
  });
  if (scopes.length > 100 || scopes.some((v) => !v.providerPresent))
    throw new ConflictException(
      "Child team repository access changed or exceeds the scope limit",
    );
  const repositoryIds = scopes.map((v) => v.repositoryId);
  return {
    teamId: id,
    revision: team.scopeRevision,
    repositoryIds,
    fingerprint: digest({
      id,
      organizationId,
      source: team.source,
      githubTeamId: team.githubTeamId,
      parentGithubTeamId: team.parentGithubTeamId,
      installationId: team.installationId?.toString(),
      revision: team.scopeRevision,
      nestedScope: team.nestedScope ?? [],
      scopes: scopes.map((v) => ({
        repositoryId: v.repositoryId,
        origin: v.origin,
        providerPresent: v.providerPresent,
      })),
    }),
  };
}
export async function verifyNestedScope(
  db: Db,
  team: { id: string; organizationId: string; nestedScope?: unknown },
) {
  const approved = nestedSources(team.nestedScope ?? []);
  if (approved.length) {
    const scopes = await db.teamRepositoryScope.findMany({
      where: {
        teamId: team.id,
        policyScopeEnabled: true,
        providerPresent: true,
      },
      select: { repositoryId: true },
    });
    if (
      approved.some((child) =>
        child.repositoryIds.some(
          (id) => !scopes.some((scope) => scope.repositoryId === id),
        ),
      )
    )
      throw new ConflictException(
        "Approved child repositories must remain in the parent policy scope",
      );
  }
  const count = { value: 0 };
  for (const child of approved) {
    const actual = await nestedSnapshot(
      db,
      child.teamId,
      team.organizationId,
      [team.id],
      count,
    );
    if (digest(actual) !== digest(child))
      throw new ConflictException(
        "Child team scope changed. Review and approve it again before publishing",
      );
  }
}
