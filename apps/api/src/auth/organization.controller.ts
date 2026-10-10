import { configurationValue } from '../configuration/runtime-configuration.js'
import { githubLoginEnabled } from './github-identity-provider.js'
import { GitHubUserAccessService } from './github-user-access.service.js'
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthService } from './auth.service.js'
import {
  AuthorizationService,
  rolePermissions,
} from './authorization.service.js'
import { SessionGuard, type AuthenticatedSession } from './session.guard.js'
import type { Request } from 'express'
export const organizationRoles = [
  'OWNER',
  'ADMIN',
  'POLICY_MANAGER',
  'SECURITY_ENGINEER',
  'ENGINEERING_LEAD',
  'DEVELOPER',
  'AUDITOR',
  'VIEWER',
] as const
class CreateOrganizationDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string
}
class MemberDto {
  @IsString() @MinLength(1) @MaxLength(320) subject!: string
  @IsOptional() @IsString() @MaxLength(120) displayName?: string
  @IsIn(organizationRoles) role!: (typeof organizationRoles)[number]
  @IsBoolean() active!: boolean
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  repositoryIds!: string[]
}
class GitHubMemberDto {
  @IsString() @MinLength(1) @MaxLength(39) username!: string
  @IsIn(organizationRoles) role!: (typeof organizationRoles)[number]
  @IsBoolean() active!: boolean
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  repositoryIds!: string[]
}
type R = Request & { preflytSession: AuthenticatedSession }
@Controller('organizations')
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Optional()
    @Inject(GitHubUserAccessService)
    private readonly github?: GitHubUserAccessService
  ) {}
  @Get('settings') @Header('Cache-Control', 'no-store')
  async settings(@Req() req: R) {
    const member = await this.access.requireOrganization(req.preflytSession, 'organization.members.manage')
    const organization = await this.db.organization.findUniqueOrThrow({
      where: { id: member.organizationId },
      select: { id: true, name: true, createdAt: true,
        githubLink: { select: { login: true } },
        installations: { where: { active: true }, select: { accountLogin: true, accountType: true } },
      },
    })
    return {
      id: organization.id, name: organization.name, createdAt: organization.createdAt,
      githubOrganization: organization.githubLink?.login ??
        organization.installations.find((installation) => installation.accountType === 'Organization')?.accountLogin ?? null,
      role: member.role,
      canUpdate: rolePermissions[member.role]?.includes('organization.settings.update') ?? false,

    }
  }
  @Patch('settings') @Header('Cache-Control', 'no-store')
  async saveSettings(@Req() req: R, @Body() body: CreateOrganizationDto) {
    this.auth.assertOrigin(req.headers.origin)
    const member = await this.access.requireOrganization(req.preflytSession, 'organization.settings.update')
    const name = body.name.trim()
    if (!name) throw new BadRequestException('Workspace name is required')
    await this.db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: member.organizationId }, data: { name } })
      await tx.auditEvent.create({ data: { event: 'organization.settings.updated', actorId: req.preflytSession.identityId,
        metadata: { organizationId: member.organizationId, fields: ['name'] } } })
    })
    return { saved: true }
  }
  @Get() @Header('Cache-Control', 'no-store') async list(@Req() req: R) {
    const memberships = await this.db.organizationMembership.findMany({
      where: { identityId: req.preflytSession.identityId, active: true },
      include: {
        organization: {
          include: {
            githubLink: { select: { login: true } },
            installations: {
              where: { active: true, accountType: 'Organization' },
              select: { accountLogin: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    const verified = []
    for (const m of memberships) {
      try {
        if (
          await this.access.membership(
            req.preflytSession.identityId,
            m.organizationId
          )
        )
          verified.push(m)
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error
      }
    }
    return {
      activeOrganizationId: req.preflytSession.organizationId,
      platformAdmin: !!req.preflytSession.platformAdmin,
      organizations: verified.map((m) => {
        // Legacy workspaces may have an installation before explicit identity linking.
        // Only an unambiguous organization installation supplies a display identity.
        const logins = [
          ...new Set(m.organization.installations.map((i) => i.accountLogin)),
        ]
        const githubLogin =
          m.organization.githubLink?.login ??
          (logins.length === 1 ? logins[0] : null)
        return {
          id: m.organizationId,
          name: githubLogin ?? m.organization.name,
          githubLogin,
          role: m.role,
        }
      }),
    }
  }
  @Post() async create(@Body() body: CreateOrganizationDto, @Req() req: R) {
    this.auth.assertOrigin(req.headers.origin)
    if (!body.name.trim())
      throw new BadRequestException('Organization name is required')
    if (!req.preflytSession.platformAdmin)
      throw new ForbiddenException(
        'Platform administration permission required'
      )
    return this.db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: body.name.trim(),
          memberships: {
            create: {
              identityId: req.preflytSession.identityId,
              role: 'OWNER',
            },
          },
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'organization_created_with_explicit_owner',
          actorId: req.preflytSession.identityId,
          metadata: {
            organizationId: org.id,
            ownerId: req.preflytSession.identityId,
          },
        },
      })
      return org
    })
  }
  @Post(':organizationId/activate') async activate(
    @Param('organizationId') id: string,
    @Req() req: R
  ) {
    this.auth.assertOrigin(req.headers.origin)
    if (!(await this.access.membership(req.preflytSession.identityId, id)))
      throw new ForbiddenException('Active organization membership required')
    // Update this browser's session only; other sessions retain their organization context.
    const { createHash } = await import('node:crypto')
    await this.db.webSession.update({
      where: {
        tokenHash: createHash('sha256')
          .update(req.cookies[this.auth.sessionCookieName])
          .digest('hex'),
      },
      data: { activeOrganizationId: id },
    })
    return { organizationId: id }
  }
  @Header('Cache-Control', 'no-store') @Get('access') async context(
    @Req() req: R
  ) {
    const session = req.preflytSession
    const member = await this.access.membership(
      session.identityId,
      session.organizationId
    )
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      'repository.read',
      false
    )
    return {
      organization: member?.organization ?? null,
      githubLoginEnabled: githubLoginEnabled(),
      githubLinked: !!(
        member &&
        (await this.db.gitHubOrganizationLink.findUnique({
          where: { organizationId: member.organizationId },
        }))
      ),
      role: member?.role ?? null,
      permissions: member ? rolePermissions[member.role] : [],
      roles: Object.entries(rolePermissions).map(([id, permissions]) => ({
        id,
        permissions,
      })),
      repositories: scope.map((r) => ({
        id: r.githubId.toString(),
        fullName: r.fullName,
      })),
      organizationWide: !!member && ['OWNER', 'ADMIN'].includes(member.role),
      platformAdmin: !!session.platformAdmin,
    }
  }
  @Header('Cache-Control', 'no-store') @Get('members') async members(
    @Req() req: R
  ) {
    const actor = await this.access.requireOrganization(
      req.preflytSession,
      'organization.members.manage'
    )
    const members = await this.db.organizationMembership.findMany({
      where: { organizationId: actor.organizationId },
      include: {
        identity: {
          select: {
            id: true,
            subject: true,
            displayName: true,
            email: true,
            githubAccounts: {
              select: { login: true, avatarUrl: true },
              where: { host: 'github.com' },
            },
          },
        },
        grants: {
          include: {
            repository: { select: { githubId: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    const audit = await this.db.auditEvent.findMany({
      where: {
        event: {
          in: [
            'organization_membership_changed',
            'organization_created_with_explicit_owner',
          ],
        },
        metadata: { path: ['organizationId'], equals: actor.organizationId },
      },
      select: {
        id: true,
        event: true,
        actorId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return {
      audit,
      roles: organizationRoles,
      members: members.map((m) => ({
        id: m.id,
        identity: m.identity,
        role: m.role,
        active: m.active,
        repositoryIds: m.grants.map((g) => g.repository.githubId.toString()),
      })),
    }
  }
  @Get('github-directory')
  @Header('Cache-Control', 'no-store')
  async githubDirectory(
    @Req() req: R,
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('unassigned') unassigned = 'false'
  ) {
    if (
      search.length > 100 ||
      !/^[1-9]\d{0,3}$/.test(page) ||
      !['true', 'false'].includes(unassigned)
    )
      throw new BadRequestException('Use a valid member search and page')
    return this.directoryResponse(
      req,
      false,
      search,
      Number(page),
      unassigned === 'true'
    )
  }
  @Post('github-directory/sync')
  @Header('Cache-Control', 'no-store')
  async syncGitHubDirectory(@Req() req: R) {
    this.auth.assertOrigin(req.headers.origin)
    const result = await this.directoryResponse(req, true, '', 1)
    await this.db.auditEvent.create({
      data: {
        event: 'github_members_synchronized',
        actorId: req.preflytSession.identityId,
        metadata: {
          organizationId: req.preflytSession.organizationId,
          memberCount: result.total,
          syncedAt: result.syncedAt,
        },
      },
    })
    return result
  }
  private async directoryResponse(
    req: R,
    refresh: boolean,
    search: string,
    page: number,
    unassigned = false
  ) {
    const actor = await this.access.requireOrganization(
      req.preflytSession,
      'organization.members.manage',
      refresh
    )
    if (!this.github)
      throw new BadRequestException('GitHub access is not configured')
    const directory = await this.github.directory(
      req.preflytSession.identityId,
      actor.organizationId,
      refresh
    )
    const grants = await this.db.organizationMembership.findMany({
      where: { organizationId: actor.organizationId },
      include: {
        identity: {
          select: {
            githubAccounts: {
              where: { host: 'github.com' },
              select: { githubUserId: true },
            },
          },
        },
      },
    })
    const byAccount = new Map(
      grants.flatMap((grant) =>
        grant.identity.githubAccounts.map(
          (account) => [account.githubUserId.toString(), grant] as const
        )
      )
    )
    const filtered = directory.members.filter(
      (member) =>
        member.login.toLowerCase().includes(search.trim().toLowerCase()) &&
        (!unassigned || !byAccount.get(member.id)?.active)
    )
    const pageSize = 50
    return {
      syncedAt: directory.syncedAt,
      total: filtered.length,
      page,
      pageSize,
      hasMore: page * pageSize < filtered.length,
      members: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((member) => {
          const grant = byAccount.get(member.id)
          return {
            ...member,
            membershipId: grant?.id ?? null,
            role: grant?.role ?? null,
            active: grant?.active ?? false,
          }
        }),
    }
  }
  @Post('github-members') async addGitHub(
    @Body() body: GitHubMemberDto,
    @Req() req: R
  ) {
    this.auth.assertOrigin(req.headers.origin)
    const actor = await this.access.requireOrganization(
      req.preflytSession,
      'organization.members.manage'
    )
    if (!this.github)
      throw new BadRequestException('GitHub access is not configured')
    const user = await this.github.resolveMember(
      req.preflytSession.identityId,
      actor.organizationId,
      body.username
    )
    return this.save(
      {
        subject: user.id.toString(),
        displayName: user.displayName ?? undefined,
        role: body.role,
        active: body.active,
        repositoryIds: body.repositoryIds,
      },
      req,
      undefined,
      user
    )
  }
  @Post('members') async add(@Body() body: MemberDto, @Req() req: R) {
    return this.save(body, req)
  }
  @Patch('members/:membershipId') async edit(
    @Param('membershipId') id: string,
    @Body() body: MemberDto,
    @Req() req: R
  ) {
    return this.save(body, req, id)
  }
  private async save(
    body: MemberDto,
    req: R,
    id?: string,
    githubUser?: {
      id: bigint
      login: string
      displayName: string | null
      avatarUrl: string | null
    }
  ) {
    this.auth.assertOrigin(req.headers.origin)
    const actor = await this.access.requireOrganization(
      req.preflytSession,
      'organization.members.manage'
    )
    const allowedRepositories = await this.access.repositoryScope(
      req.preflytSession.identityId,
      actor.organizationId,
      'repository.read',
      false
    )
    if (
      body.repositoryIds.some(
        (id) => !allowedRepositories.some((r) => r.githubId.toString() === id)
      )
    )
      throw new ForbiddenException(
        'You can assign only repositories you are authorized to access'
      )
    if (
      !id &&
      !githubUser &&
      (await this.db.gitHubOrganizationLink.findUnique({
        where: { organizationId: actor.organizationId },
      }))
    )
      throw new BadRequestException(
        'Use a verified GitHub username to grant access in this organization'
      )
    return this.db.$transaction(async (tx) => {
      // Serialize owner changes and grants in this organization.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.organizationId} FOR UPDATE`
      const liveActor = await tx.organizationMembership.findUnique({
        where: { id: actor.id },
      })
      if (!liveActor?.active || !['OWNER', 'ADMIN'].includes(liveActor.role))
        throw new ForbiddenException('Membership administration was revoked')
      const previous = id
        ? await tx.organizationMembership.findFirst({
            where: { id, organizationId: actor.organizationId },
          })
        : null
      if (id && !previous)
        throw new ForbiddenException('Membership is unavailable')
      if (previous?.identityId === req.preflytSession.identityId)
        throw new ForbiddenException(
          'Use another Owner to change your own access'
        )
      if (
        liveActor.role !== 'OWNER' &&
        (['OWNER', 'ADMIN'].includes(body.role) ||
          (previous && ['OWNER', 'ADMIN'].includes(previous.role)))
      )
        throw new ForbiddenException(
          'Only Owners can assign or change administrative roles'
        )
      if (
        previous?.role === 'OWNER' &&
        (!body.active || body.role !== 'OWNER') &&
        (await tx.organizationMembership.count({
          where: {
            organizationId: actor.organizationId,
            active: true,
            role: 'OWNER',
          },
        })) <= 1
      )
        throw new BadRequestException(
          'An organization must retain an active Owner'
        )
      const repositories = await tx.gitHubRepository.findMany({
        where: {
          githubId: {
            in: body.repositoryIds
              .filter((s) => /^[1-9]\d{0,15}$/.test(s))
              .map((s) => BigInt(s)),
          },
          installation: { organizationId: actor.organizationId },
        },
      })
      if (
        new Set(body.repositoryIds).size !== body.repositoryIds.length ||
        repositories.length !== body.repositoryIds.length
      )
        throw new BadRequestException(
          'Repository grants must belong to this organization'
        )
      const oidcIssuer = configurationValue('OIDC_ISSUER')
      const issuer = githubUser
        ? 'https://github.com'
        : oidcIssuer
          ? new URL(oidcIssuer).href
          : null
      if (!previous && !issuer)
        throw new BadRequestException(
          'Configure organization OIDC before provisioning members'
        )
      const linked =
        githubUser &&
        (await tx.gitHubUserAccount.findUnique({
          where: {
            host_githubUserId: {
              host: 'github.com',
              githubUserId: githubUser.id,
            },
          },
        }))
      const identity = linked
        ? await tx.identity.findUniqueOrThrow({
            where: { id: linked.identityId },
          })
        : previous
          ? await tx.identity.findUniqueOrThrow({
              where: { id: previous.identityId },
            })
          : await tx.identity.upsert({
              where: {
                issuer_subject: { issuer: issuer!, subject: body.subject },
              },
              create: {
                issuer: issuer!,
                subject: body.subject,
                displayName: body.displayName,
                membership: { create: { role: 'VIEWER' } },
              },
              update: {},
            })
      if (previous && identity.subject !== body.subject)
        throw new BadRequestException(
          'An existing identity subject cannot change'
        )
      if (githubUser)
        await tx.gitHubUserAccount.upsert({
          where: {
            host_githubUserId: {
              host: 'github.com',
              githubUserId: githubUser.id,
            },
          },
          create: {
            host: 'github.com',
            githubUserId: githubUser.id,
            identityId: identity.id,
            login: githubUser.login,
            displayName: githubUser.displayName,
            avatarUrl: githubUser.avatarUrl,
            verifiedAt: new Date(),
          },
          update: {
            login: githubUser.login,
            displayName: githubUser.displayName,
            avatarUrl: githubUser.avatarUrl,
            verifiedAt: new Date(),
          },
        })
      if (
        !previous &&
        (await tx.organizationMembership.findUnique({
          where: {
            organizationId_identityId: {
              organizationId: actor.organizationId,
              identityId: identity.id,
            },
          },
        }))
      )
        throw new BadRequestException(
          'Membership already exists; use its edit route'
        )
      await tx.membership.upsert({
        where: { identityId: identity.id },
        create: { identityId: identity.id, role: 'VIEWER' },
        update: {},
      })
      const member = await tx.organizationMembership.upsert({
        where: {
          organizationId_identityId: {
            organizationId: actor.organizationId,
            identityId: identity.id,
          },
        },
        create: {
          organizationId: actor.organizationId,
          identityId: identity.id,
          role: body.role,
          active: body.active,
        },
        update: { role: body.role, active: body.active },
      })
      if (member.identityId === req.preflytSession.identityId)
        throw new ForbiddenException(
          'Use another Owner to change your own access'
        )
      await tx.repositoryGrant.deleteMany({
        where: { membershipId: member.id },
      })
      if (body.repositoryIds.length)
        await tx.repositoryGrant.createMany({
          data: repositories.map((r) => ({
            membershipId: member.id,
            repositoryId: r.id,
          })),
        })
      await tx.auditEvent.create({
        data: {
          event: 'organization_membership_changed',
          actorId: req.preflytSession.identityId,
          metadata: {
            organizationId: actor.organizationId,
            membershipId: member.id,
            role: body.role,
            active: body.active,
            repositoryIds: body.repositoryIds,
          },
        },
      })
      return { id: member.id }
    })
  }
}
