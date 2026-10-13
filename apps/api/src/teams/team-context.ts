import type { PackRef } from "../standards/catalogue.js";
import { verifyNestedScope } from './nested-team-scope.js';
import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";
import { digest } from "../assessments/assessment-digest.js";
export async function verifyTeamContext(
  db: Pick<PrismaService, "preflytTeam" | "teamPolicyAssignment" | "teamRepositoryScope">,
  repositoryId: string,
  context: unknown,
) {
  if (context == null) return;
  if (!Array.isArray(context) || context.length > 100)
    throw new ConflictException("Team policy sources could not be verified");
  for (const source of context) {
    if (
      !source ||
      typeof source.teamId !== "string" ||
      typeof source.organizationId !== "string" ||
      !Number.isInteger(source.revision) ||
      typeof source.assignmentId !== "string" ||
      !/^[a-f0-9]{64}$/.test(source.digest ?? "")
    )
      throw new ConflictException("Team policy sources could not be verified");
    const team = await db.preflytTeam.findFirst({
      where: {
        id: source.teamId,
        organizationId: source.organizationId,
        scopeRevision: source.revision,
        repositories: {
          some: {
            repositoryId,
            policyScopeEnabled: true,
            providerPresent: true,
          },
        },
      },
    });
    if (team) await verifyNestedScope(db, team);
    const assignment = await db.teamPolicyAssignment.findFirst({
      where: {
        id: source.assignmentId,
        teamId: source.teamId,
        digest: source.digest,
        supersededAt: null,
      },
    });
    if (
      !team ||
      (team.source === "GITHUB" &&
        (team.syncState !== "SYNCED" ||
          !team.syncedAt ||
          Date.now() - team.syncedAt.getTime() > 86_400_000)) ||
      !assignment ||
      digest({
        branchRef: assignment.branchRef,
        profile: assignment.profile,
        packs: assignment.packs,
      }) !== assignment.digest
    )
      throw new ConflictException(
        "Team policy scope changed or needs synchronization. Preview and apply the assignment again before publishing.",
      );
  }
}
/** Current approved team scope is mandatory; repository edits may strengthen it only. */
export async function inheritedTeamStandards(
  db: Pick<PrismaService, "teamPolicyAssignment" | "preflytTeam" | "teamRepositoryScope">,
  repositoryId: string,
  organizationId: string,
) {
  const rows = await db.teamPolicyAssignment.findMany({
    where: {
      supersededAt: null,
      team: {
        organizationId,
        OR: [{ source: 'ORGANIZATION' }, { repositories: { some: { repositoryId, policyScopeEnabled: true } } }],
      },
    },
    include: { team: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 101,
  });
  if (rows.length > 100)
    throw new ConflictException(
      "Team assignment limit reached for this repository",
    );
  const context = rows.map((a) => ({
    teamId: a.teamId,
    teamName: a.team.name,
    organizationId,
    revision: a.team.scopeRevision,
    assignmentId: a.id,
    digest: a.digest,
  }));
  await verifyTeamContext(db, repositoryId, context);
  return {
    context,
    sources: rows.map((a) => ({
      label: a.team.name,
      profile: a.profile,
      packs:
        a.packs as unknown as (PackRef & {
          digest: string;
        })[],
    })),
  };
}
