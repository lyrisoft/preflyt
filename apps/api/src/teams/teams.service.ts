import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import {
  catalogue,
  catalogueVersions,
  resolvePacks,
  type AdoptionProfile,
  type StandardPack,
  type PackRef,
} from "../standards/catalogue.js";
import { organizationCatalogue } from "../standards/organization-standards.service.js";
import { digest } from "../assessments/assessment-digest.js";
import {
  composeGatePolicy,
  validPolicyBranch,
} from "../assessments/gate-policy.service.js";
import { verifyTeamContext } from "./team-context.js";
import { composeTeamStandards } from "./team-composition.js";
import type { Prisma } from "../generated/prisma/client.js";
type Db = Prisma.TransactionClient;
type TeamInput = {
  name: string;
  description: string;
  memberIds: string[];
  repositoryIds: string[];
  expectedRevision: number;
};
type AssignmentInput = {
  branchRef: string;
  profile: AdoptionProfile;
  packs: PackRef[];
  expectedPreviewHash?: string;
  replacesAssignmentId?: string;
};
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function pageNumber(input?: string) {
  if (input !== undefined && !/^[1-9]\d{0,5}$/.test(input))
    throw new BadRequestException("Choose a valid page");
  return Number(input ?? 1);
}
@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
  ) {}
  private async team(db: Db, id: string, organizationId: string) {
    const t = await db.preflytTeam.findFirst({ where: { id, organizationId } });
    if (!t) throw new NotFoundException("Team is unavailable");
    return t;
  }
  private audit(
    db: Db,
    s: AuthenticatedSession,
    event: string,
    teamId: string,
    metadata: object = {},
  ) {
    return db.auditEvent.create({
      data: {
        event: `team.${event}`,
        actorId: s.identityId,
        metadata: json({
          organizationId: s.organizationId,
          teamId,
          ...metadata,
        }),
      },
    });
  }
  private async change<T>(
    s: AuthenticatedSession,
    permission: string,
    fn: (db: Db, access: AuthorizationService) => Promise<T>,
  ) {
    await this.access.requireOrganization(s, permission, true);
    try {
      return await this.db.$transaction(
        async (tx) => {
          const access = new AuthorizationService(tx as PrismaService);
          await access.requireOrganization(s, permission);
          return fn(tx, access);
        },
        { isolationLevel: "Serializable", timeout: 30000 },
      );
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        ["P2034", "P2002"].includes(String(e.code))
      )
        throw new ConflictException(
          "Team or policy changed. Refresh and preview again.",
        );
      throw e;
    }
  }
  async baseline(s: AuthenticatedSession) {
    await this.access.requireOrganization(s, "team.manage", true);
    const existing = await this.db.preflytTeam.findFirst({
      where: { organizationId: s.organizationId!, source: "ORGANIZATION" },
    });
    if (existing) return { id: existing.id };
    const repos = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "repository.manage",
    );
    if (!repos.length || repos.length > 100)
      throw new ConflictException(
        "An organization baseline supports one to 100 selected repositories. Review the connected repository scope first.",
      );
    const connected = await this.db.gitHubRepository.count({
      where: {
        selected: true,
        available: true,
        installation: { organizationId: s.organizationId!, active: true },
      },
    });
    if (repos.length !== connected)
      throw new ForbiddenException(
        "An organization baseline requires management access to every selected repository",
      );
    return this.change(s, "team.manage", async (tx, access) => {
      const id = digest({
        purpose: "organization-policy-baseline",
        organizationId: s.organizationId!,
      });
      const team = await tx.preflytTeam.upsert({
        where: { id },
        update: {},
        create: {
          id,
          organizationId: s.organizationId!,
          source: "ORGANIZATION",
          name: "Organization baseline",
          description:
            "Mandatory shared standards for the organization. Review impact before applying; policy publication stays separate.",
          createdById: s.identityId,
        },
      });
      for (const repo of repos) {
        await access.requireRepository(
          s,
          repo.githubId.toString(),
          "repository.manage",
        );
        await tx.teamRepositoryScope.upsert({
          where: { teamId_repositoryId: { teamId: id, repositoryId: repo.id } },
          update: {},
          create: {
            teamId: id,
            repositoryId: repo.id,
            origin: "ORGANIZATION",
            providerPresent: true,
            policyScopeEnabled: true,
            approvedById: s.identityId,
            verifiedAt: new Date(),
          },
        });
      }
      await this.audit(tx, s, "baseline_created", team.id, {
        repositories: repos.length,
      });
      return { id: team.id };
    });
  }
  async list(s: AuthenticatedSession, page?: string, q = "") {
    await this.access.requireOrganization(s, "team.read");
    if (q.length > 120) throw new BadRequestException("Search is too long");
    const current = pageNumber(page);
    const repos = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "policy.read",
    );
    const where = {
      organizationId: s.organizationId!,
      ...(q.trim()
        ? { name: { contains: q.trim(), mode: "insensitive" as const } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.preflytTeam.count({ where }),
      this.db.preflytTeam.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (current - 1) * 20,
        take: 20,
        include: {
          _count: {
            select: {
              members: { where: { membership: { active: true } } },
              assignments: true,
            },
          },
          repositories: {
            where: { repositoryId: { in: repos.map((r) => r.id) } },
          },
        },
      }),
    ]);
    await this.access.requireOrganization(s, "team.read");
    return {
      page: current,
      total,
      pageSize: 20,
      teams: rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        source: t.source,
        syncState: effectiveSyncState(t),
        syncedAt: t.syncedAt,
        revision: t.revision,
        members:
          t.source === "LOCAL"
            ? t._count.members
            : Array.isArray(t.importedMembers)
              ? t.importedMembers.length
              : 0,
        repositories: t.repositories.filter((r) => r.policyScopeEnabled).length,
        pendingRepositories: t.repositories.filter(
          (r) =>
            t.source === "GITHUB" &&
            (!r.providerPresent || !r.policyScopeEnabled),
        ).length,
        assignments: t._count.assignments,
      })),
    };
  }
  async options(s: AuthenticatedSession) {
    await this.access.requireOrganization(s, "team.read");
    const repositories = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "policy.read",
    );
    const [members, versions, installations] = await Promise.all([
      this.db.organizationMembership.findMany({
        where: { organizationId: s.organizationId!, active: true },
        include: { identity: { select: { displayName: true, subject: true } } },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      organizationCatalogue(this.db, s.organizationId!),
      this.db.gitHubInstallation.findMany({
        where: {
          organizationId: s.organizationId!,
          active: true,
          accountType: "Organization",
        },
        select: { id: true, accountLogin: true },
      }),
    ]);
    return {
      repositories: repositories.map((r) => ({
        id: r.githubId.toString(),
        name: r.fullName,
        defaultBranch: r.defaultBranch,
      })),
      members: members.map((m) => ({
        id: m.id,
        name: m.identity.displayName ?? m.identity.subject,
      })),
      standards: [...catalogue, ...versions].map((p) => ({
        id: p.id,
        version: p.version,
        title: p.title,
      })),
      installations: installations.map((i) => ({
        id: i.id.toString(),
        name: i.accountLogin,
      })),
    };
  }
  async detail(s: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(s, "team.read");
    const team = await this.team(this.db, id, s.organizationId!);
    const repos = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "policy.read",
    );
    const [members, scopes, assignments, audit] = await Promise.all([
      this.db.teamMember.findMany({
        where: {
          teamId: id,
          membership: { active: true, organizationId: s.organizationId! },
        },
        include: {
          membership: {
            include: {
              identity: { select: { displayName: true, subject: true } },
            },
          },
        },
      }),
      this.db.teamRepositoryScope.findMany({
        where: { teamId: id, repositoryId: { in: repos.map((r) => r.id) } },
        include: { repository: true },
        orderBy: { repositoryId: "asc" },
      }),
      this.db.teamPolicyAssignment.findMany({
        where: { teamId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
      this.db.auditEvent.findMany({
        where: {
          event: { startsWith: "team." },
          metadata: { path: ["teamId"], equals: id },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
    ]);
    const impact = [];
    for (const scope of scopes.filter((r) => r.policyScopeEnabled)) {
      const [policy, selection] = await Promise.all([
        this.db.gatePolicyRevision.findFirst({
          where: {
            repositoryId: scope.repositoryId,
            organizationId: s.organizationId!,
            definition: {
              path: ["teamContext"],
              array_contains: [{ teamId: id }],
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        this.db.repositoryStandardsSelection.findFirst({
          where: { repositoryId: scope.repositoryId },
          orderBy: { revision: "desc" },
        }),
      ]);
      let current = !!policy && policy.selectionId === selection?.id;
      if (policy)
        try {
          await verifyTeamContext(
            this.db,
            scope.repositoryId,
            (policy.definition as { teamContext?: unknown }).teamContext,
          );
        } catch (e) {
          if (e instanceof ConflictException) current = false;
          else throw e;
        }
      impact.push({
        githubId: scope.repository.githubId.toString(),
        name: scope.repository.fullName,
        policyId: policy?.id ?? null,
        branchRef: policy?.branchRef ?? null,
        state: policy?.state ?? "NOT_ASSIGNED",
        revision: policy?.revision ?? null,
        current,
      });
    }
    await this.access.requireOrganization(s, "team.read");
    return {
      impact,
      id: team.id,
      name: team.name,
      description: team.description,
      source: team.source,
      revision: team.revision,
      syncState: effectiveSyncState(team),
      syncedAt: team.syncedAt,
      githubSlug: team.githubSlug,
      parentGithubTeamId: team.parentGithubTeamId,
      members:
        team.source === "LOCAL"
          ? members.map((m) => ({
              id: m.membershipId,
              name:
                m.membership.identity.displayName ??
                m.membership.identity.subject,
            }))
          : team.importedMembers,
      repositories: scopes.map((r) => ({
        id: r.repository.githubId.toString(),
        name: r.repository.fullName,
        policyScopeEnabled: r.policyScopeEnabled,
        providerPresent: r.providerPresent,
        origin: r.origin,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        branchRef: a.branchRef,
        profile: a.profile,
        packs: a.packs,
        digest: a.digest,
        createdAt: a.createdAt,
        supersededAt: a.supersededAt,
      })),
      activity: audit.map((a) => ({
        id: a.id,
        event: a.event,
        createdAt: a.createdAt,
      })),
    };
  }
  async save(s: AuthenticatedSession, b: TeamInput, id?: string) {
    await this.access.requireOrganization(s, "team.manage", true);
    if (
      !b.name.trim() ||
      b.repositoryIds.length > 100 ||
      b.memberIds.length > 100
    )
      throw new BadRequestException(
        "Add a team name and choose up to 100 members and repositories",
      );
    const authorized = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "repository.manage",
    );
    if (
      b.repositoryIds.some(
        (r) => !authorized.some((repo) => repo.githubId.toString() === r),
      )
    )
      throw new ForbiddenException("Choose repositories you can manage");
    return this.change(s, "team.manage", async (tx, access) => {
      const previous = id ? await this.team(tx, id, s.organizationId!) : null;
      if ((previous?.revision ?? 0) !== b.expectedRevision)
        throw new ConflictException("Team changed. Refresh before saving.");
      if (
        previous?.source === "GITHUB" &&
        (b.name !== previous.name ||
          b.description !== previous.description ||
          b.memberIds.length)
      )
        throw new BadRequestException(
          "Edit imported team names and members in GitHub. Preflyt only manages policy scope.",
        );
      if (
        !id &&
        (await tx.preflytTeam.count({
          where: { organizationId: s.organizationId! },
        })) >= 500
      )
        throw new ConflictException("Organization team limit reached");
      const validMembers = await tx.organizationMembership.count({
        where: {
          id: { in: b.memberIds },
          organizationId: s.organizationId!,
          active: true,
        },
      });
      if (validMembers !== b.memberIds.length)
        throw new BadRequestException("Choose active organization members");
      for (const r of b.repositoryIds)
        await access.requireRepository(s, r, "repository.manage");
      if (previous?.source === "ORGANIZATION") {
        if (b.memberIds.length)
          throw new BadRequestException(
            "Organization baseline does not manage team membership",
          );
        const connected = await tx.gitHubRepository.findMany({
          where: {
            selected: true,
            available: true,
            installation: { organizationId: s.organizationId!, active: true },
          },
          select: { githubId: true },
        });
        if (
          connected.length !== b.repositoryIds.length ||
          connected.some(
            (repo) => !b.repositoryIds.includes(repo.githubId.toString()),
          )
        )
          throw new BadRequestException(
            "The organization baseline must include every selected repository. Review newly connected repositories before saving.",
          );
      }
      const priorScope = previous
        ? await tx.teamRepositoryScope.findMany({
            where: {
              teamId: previous.id,
              policyScopeEnabled: true,
              repositoryId: { in: authorized.map((r) => r.id) },
            },
            include: { repository: true },
          })
        : [];
      const removesAssignedRepository = priorScope.some(
        (scope) => !b.repositoryIds.includes(scope.repository.githubId.toString()),
      );
      if (
        previous &&
        removesAssignedRepository &&
        (await tx.teamPolicyAssignment.count({
          where: { teamId: previous.id, supersededAt: null },
        }))
      )
        throw new ConflictException(
          "This team has assigned standards. Removing a covered repository needs an approved exception. Keep the repository selected; exception approval is not available yet.",
        );
      const scopeChanged =
        digest(
          priorScope.map((r) => r.repository.githubId.toString()).sort(),
        ) !== digest([...b.repositoryIds].sort());
      const team = previous
        ? await tx.preflytTeam.update({
            where: { id },
            data: {
              name: b.name.trim(),
              description: b.description.trim(),
              revision: { increment: 1 },
              ...(scopeChanged ? { scopeRevision: { increment: 1 } } : {}),
            },
          })
        : await tx.preflytTeam.create({
            data: {
              organizationId: s.organizationId!,
              name: b.name.trim(),
              description: b.description.trim(),
              createdById: s.identityId,
            },
          });
      if (team.source === "LOCAL") {
        await tx.teamMember.deleteMany({ where: { teamId: team.id } });
        await tx.teamMember.createMany({
          data: b.memberIds.map((membershipId) => ({
            teamId: team.id,
            membershipId,
          })),
        });
      }
      // Never clear scopes for resources outside this actor's current repository scope.
      await tx.teamRepositoryScope.updateMany({
        where: {
          teamId: team.id,
          repositoryId: { in: authorized.map((r) => r.id) },
        },
        data: { policyScopeEnabled: false },
      });
      for (const githubId of b.repositoryIds) {
        const repo = authorized.find(
          (r) => r.githubId.toString() === githubId,
        )!;
        if (team.source === "GITHUB") {
          const scope = await tx.teamRepositoryScope.findUnique({
            where: {
              teamId_repositoryId: { teamId: team.id, repositoryId: repo.id },
            },
          });
          if (
            !scope?.providerPresent ||
            team.syncState !== "SYNCED" ||
            !team.syncedAt ||
            Date.now() - team.syncedAt.getTime() > 86400000
          )
            throw new ConflictException(
              "Sync the GitHub team before approving its repository scope",
            );
        }
        await tx.teamRepositoryScope.upsert({
          where: {
            teamId_repositoryId: { teamId: team.id, repositoryId: repo.id },
          },
          create: {
            teamId: team.id,
            repositoryId: repo.id,
            origin: "MANUAL",
            policyScopeEnabled: true,
            approvedById: s.identityId,
          },
          update: { policyScopeEnabled: true, approvedById: s.identityId },
        });
      }
      await this.audit(tx, s, previous ? "updated" : "created", team.id, {
        revision: team.revision,
        repositoryGithubIds: b.repositoryIds,
      });
      return { id: team.id };
    });
  }
  private async installation(s: AuthenticatedSession, id?: string) {
    if (id && !/^[1-9]\d{0,15}$/.test(id))
      throw new BadRequestException("Choose a connected GitHub organization");
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId: s.organizationId! },
    });
    if (!link)
      throw new ConflictException(
        "Link your GitHub organization in Access Control before importing teams",
      );
    const installation = await this.db.gitHubInstallation.findFirst({
      where: {
        ...(id ? { id: BigInt(id) } : {}),
        accountLogin: link.login,
        accountType: "Organization",
        organizationId: s.organizationId!,
        active: true,
      },
    });
    if (!installation)
      throw new ForbiddenException(
        "Choose the installation linked to this organization",
      );
    return { link, installation };
  }
  private async providerRead<T>(
    installationId: bigint,
    orgId: bigint,
    read: (
      request: (path: string) => Promise<Record<string, any>[]>,
      login: string,
    ) => Promise<T>,
  ) {
    return this.github.withOrganizationMembers(
      installationId,
      orgId,
      async (token, login) => {
        const request = async (path: string) => {
          try {
            const rows: Record<string, any>[] = [];
            for (let page = 1; page <= 10; page++) {
              const response = await fetch(
                `https://api.github.com${path}?per_page=100&page=${page}`,
                {
                  headers: {
                    accept: "application/vnd.github+json",
                    authorization: `Bearer ${token}`,
                    "x-github-api-version": "2022-11-28",
                  },
                  redirect: "error",
                  signal: AbortSignal.timeout(10000),
                },
              );
              if (!response.ok)
                throw new ServiceUnavailableException(
                  response.status === 403 || response.status === 429
                    ? "GitHub team sync is unavailable or rate-limited. Previous scope is preserved."
                    : "GitHub teams could not be read. Check installation permissions and retry.",
                );
              if (!response.body)
                throw new ServiceUnavailableException(
                  "GitHub team response is empty",
                );
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let size = 0;
              try {
                while (true) {
                  const part = await reader.read();
                  if (part.done) break;
                  size += part.value.byteLength;
                  if (size > 2000000)
                    throw new ServiceUnavailableException(
                      "GitHub team response exceeds the import limit",
                    );
                  chunks.push(part.value);
                }
              } finally {
                await reader.cancel().catch(() => {});
              }
              const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (!Array.isArray(data) || data.length > 100)
                throw new ServiceUnavailableException(
                  "GitHub returned an incomplete team response",
                );
              rows.push(...data);
              if (data.length < 100) return rows;
            }
            throw new ServiceUnavailableException(
              "GitHub team sync exceeds 1,000 entries. Previous scope is preserved.",
            );
          } catch (error) {
            if (error instanceof ServiceUnavailableException) throw error;
            throw new ServiceUnavailableException(
              "GitHub team sync could not complete. Retry; previous scope is preserved.",
            );
          }
        };
        return read(request, login);
      },
    );
  }
  async discover(s: AuthenticatedSession, id?: string) {
    await this.access.requireOrganization(s, "team.import", true);
    const { link, installation } = await this.installation(s, id);
    return this.providerRead(
      installation.id,
      link.githubOrganizationId,
      async (request, login) => ({
        installationId: installation.id.toString(),
        teams: (await request(`/orgs/${encodeURIComponent(login)}/teams`)).map(
          (t) => {
            if (
              !Number.isSafeInteger(t.id) ||
              typeof t.name !== "string" ||
              typeof t.slug !== "string"
            )
              throw new ServiceUnavailableException(
                "GitHub team identity could not be verified",
              );
            return {
              id: String(t.id),
              name: t.name,
              slug: t.slug,
              parentId: t.parent?.id ? String(t.parent.id) : null,
            };
          },
        ),
      }),
    );
  }
  private async snapshot(
    s: AuthenticatedSession,
    installationId: string,
    teamId: string,
  ) {
    const { link, installation } = await this.installation(s, installationId);
    const visible = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "repository.manage",
    );
    return this.providerRead(
      installation.id,
      link.githubOrganizationId,
      async (request, login) => {
        const team = (
          await request(`/orgs/${encodeURIComponent(login)}/teams`)
        ).find((t) => String(t.id) === teamId);
        if (
          !team ||
          typeof team.slug !== "string" ||
          typeof team.name !== "string"
        )
          throw new ConflictException(
            "GitHub team is no longer available. Previous scope is preserved.",
          );
        const base = `/orgs/${encodeURIComponent(login)}/teams/${encodeURIComponent(team.slug)}`;
        const members = await request(`${base}/members`);
        const repositories = await request(`${base}/repos`);
        if (
          members.some(
            (m) => !Number.isSafeInteger(m.id) || typeof m.login !== "string",
          ) ||
          repositories.some((r) => !Number.isSafeInteger(r.id))
        )
          throw new ServiceUnavailableException(
            "GitHub team response could not be verified",
          );
        return {
          team,
          link,
          installation,
          visibleIds: visible.map((r) => r.id),
          members: members.map((m) => ({ id: String(m.id), name: m.login })),
          repositories: visible.filter((r) =>
            repositories.some((p) => String(p.id) === r.githubId.toString()),
          ),
        };
      },
    );
  }
  async importTeam(
    s: AuthenticatedSession,
    installationId: string,
    teamId: string,
  ) {
    await this.access.requireOrganization(s, "team.import", true);
    const snapshot = await this.snapshot(s, installationId, teamId);
    return this.writeSnapshot(s, snapshot);
  }
  private async writeSnapshot(
    s: AuthenticatedSession,
    snapshot: Awaited<ReturnType<TeamsService["snapshot"]>>,
    existingId?: string,
    revision?: number,
  ) {
    return this.change(s, "team.import", async (tx, access) => {
      const live = await tx.gitHubOrganizationLink.findFirst({
        where: {
          organizationId: s.organizationId!,
          githubOrganizationId: snapshot.link.githubOrganizationId,
        },
      });
      if (
        !live ||
        !(await tx.gitHubInstallation.findFirst({
          where: {
            id: snapshot.installation.id,
            organizationId: s.organizationId!,
            active: true,
          },
        }))
      )
        throw new ConflictException("GitHub organization connection changed");
      const previous = await tx.preflytTeam.findFirst({
        where: {
          organizationId: s.organizationId!,
          githubTeamId: String(snapshot.team.id),
        },
      });
      if (
        existingId &&
        (!previous ||
          previous.id !== existingId ||
          previous.revision !== revision)
      )
        throw new ConflictException(
          "Team changed during synchronization. Retry.",
        );
      if (!existingId && previous)
        throw new ConflictException(
          "This GitHub team is already imported. Use Sync.",
        );
      if (
        !previous &&
        (await tx.preflytTeam.count({
          where: { organizationId: s.organizationId! },
        })) >= 500
      )
        throw new ConflictException("Maximum 500 teams per organization");
      const data = {
        name: snapshot.team.name as string,
        description:
          typeof snapshot.team.description === "string"
            ? snapshot.team.description
            : "",
        source: "GITHUB",
        githubTeamId: String(snapshot.team.id),
        githubOrganizationId: snapshot.link.githubOrganizationId.toString(),
        githubSlug: snapshot.team.slug as string,
        parentGithubTeamId: snapshot.team.parent?.id
          ? String(snapshot.team.parent.id)
          : null,
        installationId: snapshot.installation.id,
        importedMembers: json(snapshot.members),
        syncState: "SYNCED",
        syncedAt: new Date(),
      };
      const existingScopes = previous
        ? await tx.teamRepositoryScope.findMany({
            where: {
              teamId: previous.id,
              policyScopeEnabled: true,
              repositoryId: { in: snapshot.visibleIds },
            },
            include: { repository: true },
          })
        : [];
      const changed = existingScopes.some(
        (scope) =>
          scope.providerPresent !==
          snapshot.repositories.some((repo) => repo.id === scope.repositoryId),
      );
      const team = previous
        ? await tx.preflytTeam.update({
            where: { id: previous.id },
            data: {
              ...data,
              revision: { increment: 1 },
              ...(changed ? { scopeRevision: { increment: 1 } } : {}),
            },
          })
        : await tx.preflytTeam.create({
            data: {
              ...data,
              organizationId: s.organizationId!,
              createdById: s.identityId,
            },
          });
      // Only reconcile the resources this administrator can currently verify.
      const verified = await access.repositoryScope(
        s.identityId,
        s.organizationId,
        "repository.manage",
      );
      await tx.teamRepositoryScope.updateMany({
        where: {
          teamId: team.id,
          repositoryId: { in: verified.map((r) => r.id) },
        },
        data: { providerPresent: false },
      });
      for (const repo of snapshot.repositories) {
        await access.requireRepository(
          s,
          repo.githubId.toString(),
          "repository.manage",
        );
        await tx.teamRepositoryScope.upsert({
          where: {
            teamId_repositoryId: { teamId: team.id, repositoryId: repo.id },
          },
          create: {
            teamId: team.id,
            repositoryId: repo.id,
            origin: "GITHUB",
            verifiedAt: new Date(),
          },
          update: { providerPresent: true, verifiedAt: new Date() },
        });
      }
      await this.audit(tx, s, previous ? "synced" : "imported", team.id, {
        revision: team.revision,
      });
      return { id: team.id };
    });
  }
  private lastReconciliation = 0;
  private reconciliationCursor: string | undefined;
  /** Read-only GitHub reconciliation never approves newly discovered policy scope. */
  async reconcile() {
    if (Date.now() - this.lastReconciliation < 60000) return;
    this.lastReconciliation = Date.now();
    const teams = await this.db.preflytTeam.findMany({
      where: {
        source: "GITHUB",
        OR: [
          { syncedAt: null },
          { syncedAt: { lt: new Date(Date.now() - 900000) } },
        ],
      },
      orderBy: { id: "asc" },
      take: 5,
      ...(this.reconciliationCursor
        ? { cursor: { id: this.reconciliationCursor }, skip: 1 }
        : {}),
    });
    this.reconciliationCursor = teams.at(-1)?.id;
    for (const team of teams) {
      const member = await this.db.organizationMembership.findFirst({
        where: {
          organizationId: team.organizationId,
          identityId: team.createdById,
          active: true,
        },
        include: { identity: true },
      });
      if (!member) continue;
      const actor: AuthenticatedSession = {
        authenticated: true,
        identityId: member.identityId,
        organizationId: member.organizationId,
        subject: member.identity.subject,
        email: null,
        role: member.role,
        platformAdmin: false,
      };
      // Recheck the original importer's current role/provider access. No synthetic
      // Super Admin authority or replacement actor may expand the verified scope.
      try {
        await this.sync(actor, team.id);
      } catch {
        /* sync records stale state; unchanged scope remains reviewable */
      }
    }
  }
  async sync(s: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(s, "team.import", true);
    const team = await this.team(this.db, id, s.organizationId!);
    if (team.source !== "GITHUB" || !team.installationId || !team.githubTeamId)
      throw new BadRequestException("Choose an imported GitHub team");
    try {
      return await this.writeSnapshot(
        s,
        await this.snapshot(
          s,
          team.installationId.toString(),
          team.githubTeamId,
        ),
        id,
        team.revision,
      );
    } catch (e) {
      await this.change(s, "team.import", async (tx) => {
        await tx.preflytTeam.updateMany({
          where: {
            id,
            organizationId: s.organizationId!,
            revision: team.revision,
          },
          data: { syncState: "STALE" },
        });
        await this.audit(tx, s, "sync_failed", id);
      });
      throw e;
    }
  }
  private async impact(
    tx: Db,
    s: AuthenticatedSession,
    id: string,
    b: AssignmentInput,
  ) {
    const team = await this.team(tx, id, s.organizationId!);
    if (
      !validPolicyBranch(b.branchRef) ||
      !b.packs.length ||
      b.packs.length > 5 ||
      new Set(b.packs.map((p) => p.id)).size !== b.packs.length
    )
      throw new BadRequestException(
        "Choose an explicit branch and up to five distinct standard versions",
      );
    const library: StandardPack[] = [
      ...catalogueVersions,
      ...(await organizationCatalogue(tx, s.organizationId!)),
    ];
    const frozen = b.packs.map((ref) => {
      const p = library.find(
        (p) => p.id === ref.id && p.version === ref.version,
      );
      if (!p)
        throw new BadRequestException(
          "Choose a standard version in this organization",
        );
      return {
        id: p.id,
        version: p.version,
        digest: p.digest,
        ...(p.id.startsWith("org-standard-")
          ? {
              definition: Object.fromEntries(
                Object.entries(p).filter(
                  ([k]) => !["versionId", "createdAt"].includes(k),
                ),
              ) as StandardPack,
            }
          : {}),
      };
    });
    const replacing = b.replacesAssignmentId
      ? await tx.teamPolicyAssignment.findFirst({
          where: {
            id: b.replacesAssignmentId,
            teamId: id,
            branchRef: b.branchRef,
            supersededAt: null,
          },
        })
      : null;
    if (b.replacesAssignmentId && !replacing)
      throw new ConflictException(
        "The assignment changed. Choose a current assignment to replace.",
      );
    if (replacing) {
      const oldPacks = replacing.packs as (PackRef & { digest: string })[];
      const resolved = resolvePacks(oldPacks);
      if (
        resolved.some(
          (pack, index) => !pack || pack.digest !== oldPacks[index].digest,
        )
      )
        throw new ConflictException(
          "The previous standard versions could not be verified.",
        );
      const oldDefinitions = resolved as StandardPack[];
      const nextDefinitions: StandardPack[] = frozen.flatMap(
        (ref) =>
          library.find((p) => p.id === ref.id && p.version === ref.version) ??
          [],
      );
      const ranks = ["DEFAULT", "RECOMMENDED", "STRICT"];
      if (
        ranks.indexOf(b.profile) < ranks.indexOf(replacing.profile) ||
        oldPacks.some((ref) => !frozen.some((p) => p.id === ref.id)) ||
        oldDefinitions.some((pack) =>
          pack.rules.some(
            (rule) =>
              !nextDefinitions.some((p) =>
                p.rules.some(
                  (next) =>
                    next.id === rule.id &&
                    (!rule.requiredIn.includes(
                      replacing.profile as AdoptionProfile,
                    ) ||
                      next.requiredIn.includes(b.profile)),
                ),
              ),
          ),
        ) ||
        oldDefinitions.some((pack) =>
          (pack.aiChecks ?? []).some(
            (check) =>
              !nextDefinitions.some((p) =>
                (p.aiChecks ?? []).some((next) => next.id === check.id),
              ),
          ),
        )
      ) {
        throw new ConflictException(
          "An upgrade must preserve inherited checks and profile. Removing inherited requirements needs a separately approved exception.",
        );
      }
    }
    const scopes = await tx.teamRepositoryScope.findMany({
      where: { teamId: id, policyScopeEnabled: true },
      include: { repository: true },
      orderBy: { repositoryId: "asc" },
    });
    if (!scopes.length || scopes.length > 100)
      throw new ConflictException(
        "Approve between one and 100 repositories in the team policy scope first",
      );
    const repos = [];
    const access = new AuthorizationService(tx as PrismaService);
    for (const scope of scopes) {
      const repo = await access.requireRepository(
        s,
        scope.repository.githubId.toString(),
        "policy.draft",
      );
      const current = await tx.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: "desc" },
      });
      const others = await tx.teamPolicyAssignment.findMany({
        where: {
          branchRef: b.branchRef,
          supersededAt: null,
          ...(replacing ? { id: { not: replacing.id } } : {}),
          team: {
            organizationId: s.organizationId!,
            OR: [
              { source: "ORGANIZATION" },
              {
                repositories: {
                  some: { repositoryId: repo.id, policyScopeEnabled: true },
                },
              },
            ],
          },
        },
        include: { team: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 101,
      });
      // Only replace the frozen contribution from the explicitly selected assignment.
      // Other teams and repository additions still participate and can conflict.
      const replacesCurrent =
        replacing &&
        Array.isArray(current?.teamContext) &&
        (current.teamContext as any[]).some(
          (source) => source.assignmentId === replacing.id,
        );
      const currentPacks = (current?.packs ?? []) as (PackRef & {
        digest: string;
      })[];
      const repositoryPacks = replacesCurrent
        ? currentPacks.filter(
            (ref) =>
              !(replacing.packs as (PackRef & { digest: string })[]).some(
                (old) =>
                  old.id === ref.id &&
                  old.version === ref.version &&
                  old.digest === ref.digest,
              ),
          )
        : currentPacks;
      const composed = composeTeamStandards([
        ...(current
          ? [
              {
                label: "Repository standards",
                profile: current.profile,
                packs: repositoryPacks,
              },
            ]
          : []),
        ...others.map((a) => ({
          label: a.team.name,
          profile: a.profile,
          packs: a.packs as (PackRef & { digest: string })[],
        })),
        { label: team.name, profile: b.profile, packs: frozen },
      ]);
      if (others.length >= 100)
        composed.conflicts.push(
          "Team assignment limit reached for this repository",
        );
      if (
        !scope.providerPresent ||
        (team.source === "GITHUB" &&
          (team.syncState !== "SYNCED" ||
            !team.syncedAt ||
            Date.now() - team.syncedAt.getTime() > 86400000))
      )
        composed.conflicts.push(
          "Synchronize and review GitHub repository scope before applying",
        );
      for (const other of others) {
        const assoc = await tx.teamRepositoryScope.findUnique({
          where: {
            teamId_repositoryId: {
              teamId: other.teamId,
              repositoryId: repo.id,
            },
          },
        });
        if (
          !assoc?.providerPresent ||
          (other.team.source === "GITHUB" &&
            (other.team.syncState !== "SYNCED" ||
              !other.team.syncedAt ||
              Date.now() - other.team.syncedAt.getTime() > 86400000))
        )
          composed.conflicts.push(
            `${other.team.name}: team scope needs synchronization`,
          );
      }
      const policy = await tx.gatePolicyRevision.findFirst({
        where: {
          repositoryId: repo.id,
          branchRef: b.branchRef,
          state: "PUBLISHED",
        },
        orderBy: { publishedAt: "desc" },
      });
      const required =
        (
          policy?.definition as
            { rules?: { id: string; required: boolean }[] } | undefined
        )?.rules
          ?.filter((r) => r.required)
          .map((r) => r.id) ?? [];
      const existingIds = new Set(
        current
          ? composeTeamStandards([
              {
                label: "Current",
                profile: current.profile,
                packs: current.packs as (PackRef & { digest: string })[],
              },
            ]).packs.flatMap(
              (ref) =>
                library
                  .find((p) => p.id === ref.id && p.version === ref.version)
                  ?.rules.map((r) => r.id) ?? [],
            )
          : [],
      );
      repos.push({
        repositoryId: repo.id,
        githubId: repo.githubId.toString(),
        name: repo.fullName,
        selectionId: current?.id ?? null,
        selectionRevision: current?.revision ?? 0,
        publishedPolicyId: policy?.id ?? null,
        publishedHash: policy?.definitionHash ?? null,
        profile: composed.profile,
        packs: composed.packs,
        conflicts: composed.conflicts,
        requiredRules: required,
        sources: others.map((a) => ({
          teamId: a.teamId,
          organizationId: s.organizationId!,
          revision: a.team.scopeRevision,
          teamName: a.team.name,
          assignmentId: a.id,
          digest: a.digest,
        })),
        addedChecks: composed.packs
          .flatMap(
            (ref) =>
              library.find((p) => p.id === ref.id && p.version === ref.version)
                ?.rules ?? [],
          )
          .filter((r) => !existingIds.has(r.id))
          .map((r) => r.title),
      });
    }
    const summary = {
      teamId: id,
      teamRevision: team.revision,
      scopeRevision: team.scopeRevision,
      branchRef: b.branchRef,
      profile: b.profile,
      packs: frozen,
      replacesAssignmentId: replacing?.id ?? null,
      repositories: repos,
    };
    return {
      ...summary,
      previewHash: digest(summary),
      conflicts: repos.some((r) => r.conflicts.length > 0),
    };
  }
  async preview(s: AuthenticatedSession, id: string, b: AssignmentInput) {
    await this.access.requireOrganization(s, "team.policy.assign", true);
    const repos = await this.access.repositoryScope(
      s.identityId,
      s.organizationId,
      "policy.draft",
    );
    const scopes = await this.db.teamRepositoryScope.findMany({
      where: {
        teamId: id,
        team: { organizationId: s.organizationId! },
        policyScopeEnabled: true,
      },
    });
    if (scopes.some((scope) => !repos.some((r) => r.id === scope.repositoryId)))
      throw new ForbiddenException(
        "You must be able to manage every repository in this team policy scope",
      );
    return this.db.$transaction((tx) => this.impact(tx, s, id, b), {
      isolationLevel: "Serializable",
      timeout: 30000,
    });
  }
  async assign(s: AuthenticatedSession, id: string, b: AssignmentInput) {
    await this.preview(s, id, b);
    return this.change(s, "team.policy.assign", async (tx) => {
      const impact = await this.impact(tx, s, id, b);
      if (impact.previewHash !== b.expectedPreviewHash)
        throw new ConflictException(
          "The impact changed. Preview again before applying.",
        );
      if (impact.conflicts)
        throw new ConflictException(
          "Resolve policy conflicts before applying the assignment",
        );
      if (
        (await tx.teamPolicyAssignment.count({ where: { teamId: id } })) >= 100
      )
        throw new ConflictException("Team assignment limit reached");
      const definition = {
        branchRef: b.branchRef,
        profile: b.profile,
        packs: impact.packs,
      };
      const assignment = await tx.teamPolicyAssignment.create({
        data: {
          teamId: id,
          ...definition,
          packs: json(impact.packs),
          digest: digest(definition),
          createdById: s.identityId,
        },
      });
      if (b.replacesAssignmentId) {
        const retired = await tx.teamPolicyAssignment.updateMany({
          where: { id: b.replacesAssignmentId, teamId: id, supersededAt: null },
          data: { supersededAt: new Date() },
        });
        if (retired.count !== 1)
          throw new ConflictException("The assignment changed. Preview again.");
        await this.audit(tx, s, "policy_upgraded", id, {
          previousAssignmentId: b.replacesAssignmentId,
          assignmentId: assignment.id,
          previewHash: impact.previewHash,
        });
      }
      const drafts = [];
      for (const repo of impact.repositories) {
        const teamContext = [
          ...repo.sources,
          {
            teamId: id,
            organizationId: s.organizationId!,
            revision: impact.scopeRevision,
            teamName: (await this.team(tx, id, s.organizationId!)).name,
            assignmentId: assignment.id,
            digest: assignment.digest,
          },
        ];
        const selection = await tx.repositoryStandardsSelection.create({
          data: {
            repositoryId: repo.repositoryId,
            revision: repo.selectionRevision + 1,
            profile: repo.profile,
            packs: json(repo.packs),
            teamContext: json(teamContext),
            selectedById: s.identityId,
          },
        });
        const latest = await tx.gatePolicyRevision.findFirst({
          where: { repositoryId: repo.repositoryId, branchRef: b.branchRef },
          orderBy: { revision: "desc" },
        });
        const definition = {
          ...composeGatePolicy(selection, b.branchRef, repo.requiredRules),
          organizationId: s.organizationId!,
          repositoryGithubId: repo.githubId,
          teamContext,
        };
        const draft = await tx.gatePolicyRevision.create({
          data: {
            organizationId: s.organizationId!,
            repositoryId: repo.repositoryId,
            branchRef: b.branchRef,
            revision: (latest?.revision ?? 0) + 1,
            selectionId: selection.id,
            definition: json(definition),
            definitionHash: digest(definition),
            draftedById: s.identityId,
          },
        });
        await this.audit(tx, s, "policy_draft_created", id, {
          assignmentId: assignment.id,
          repositoryGithubId: repo.githubId,
          selectionId: selection.id,
          policyId: draft.id,
          definitionHash: draft.definitionHash,
        });
        drafts.push({ githubId: repo.githubId, policyId: draft.id });
      }
      await this.audit(tx, s, "policy_assigned", id, {
        assignmentId: assignment.id,
        previewHash: impact.previewHash,
        drafts,
      });
      return { assignmentId: assignment.id, drafts };
    });
  }
}

function effectiveSyncState(team: {
  source: string;
  syncState: string;
  syncedAt: Date | null;
}) {
  return team.source === "GITHUB" &&
    (!team.syncedAt || Date.now() - team.syncedAt.getTime() > 86400000)
    ? "STALE"
    : team.syncState;
}
