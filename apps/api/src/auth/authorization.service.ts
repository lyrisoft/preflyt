import { GitHubUserAccessService } from './github-user-access.service.js'
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AuthenticatedSession } from './session.guard.js'

export const rolePermissions: Record<string, string[]> = {
  OWNER: [
    'organization.members.manage',
    'organization.settings.update',
    'repository.connect',
    'repository.read',
    'repository.manage',
    'assessment.read',
    'assessment.run',
    'policy.read',
    'policy.draft',
    'policy.publish',
    'github.ruleset.manage',
    'policy.enforcement.manage',
    'evidence.manage',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  ADMIN: [
    'organization.members.manage',
    'repository.connect',
    'repository.read',
    'repository.manage',
    'assessment.read',
    'assessment.run',
    'policy.read',
    'policy.draft',
    'policy.publish',
    'github.ruleset.manage',
    'policy.enforcement.manage',
    'evidence.manage',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  POLICY_MANAGER: [
    'repository.read',
    'assessment.read',
    'policy.read',
    'policy.draft',
    'policy.publish',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  SECURITY_ENGINEER: [
    'repository.read',
    'assessment.read',
    'policy.read',
    'evidence.manage',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  ENGINEERING_LEAD: [
    'repository.read',
    'assessment.read',
    'assessment.run',
    'policy.read',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  DEVELOPER: [
    'repository.read',
    'assessment.read',
    'assessment.run',
    'policy.read',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  AUDITOR: [
    'repository.read',
    'assessment.read',
    'policy.read',
    'contributors.read',
    'contributors.activity.read',
    'contributors.policy_evidence.read',
  ],
  VIEWER: [
    'repository.read',
    'assessment.read',
    'policy.read',
    'contributors.read',
  ],
}

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(PrismaService) readonly prisma: PrismaService,
    @Optional()
    @Inject(GitHubUserAccessService)
    private readonly github?: GitHubUserAccessService
  ) {}
  async membership(
    identityId: string,
    organizationId?: string | null,
    fresh = false
  ) {
    if (!organizationId) return null
    const member = await this.prisma.organizationMembership.findFirst({
      where: { identityId, organizationId, active: true },
      include: { organization: true },
    })
    if (member)
      await this.github?.repositoryIds(identityId, organizationId, fresh)
    return member
  }
  async repositoryScope(
    identityId: string,
    organizationId?: string | null,
    permission = 'repository.read',
    selected = true
  ) {
    const member = await this.membership(identityId, organizationId)
    if (!member || !rolePermissions[member.role]?.includes(permission))
      return []
    const githubIds = await this.github?.repositoryIds(
      identityId,
      member.organizationId
    )
    return this.prisma.gitHubRepository.findMany({
      where: {
        ...(githubIds ? { githubId: { in: githubIds } } : {}),
        ...(selected ? { selected: true } : {}),
        available: true,
        installation: { active: true, organizationId: member.organizationId },
        ...(['OWNER', 'ADMIN'].includes(member.role)
          ? {}
          : { repositoryGrants: { some: { membershipId: member.id } } }),
      },
    })
  }
  async requireOrganization(
    session: AuthenticatedSession,
    permission: string,
    fresh?: boolean
  ) {
    const member = await this.membership(
      session.identityId,
      session.organizationId,
      fresh ??
        [
          'organization.members.manage',
          'organization.settings.update',
          'repository.connect',
          'policy.publish',
          'github.ruleset.manage',
          'policy.enforcement.manage',
        ].includes(permission)
    )
    if (!member || !rolePermissions[member.role]?.includes(permission))
      await this.deny(session, permission)
    return member!
  }
  async requireRepository(
    session: AuthenticatedSession,
    id: string,
    permission: string,
    selected = true
  ) {
    const member = await this.requireOrganization(session, permission)
    if (!/^[1-9]\d{0,15}$/.test(id)) await this.deny(session, permission)
    const repository = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(id),
        ...(selected ? { selected: true } : {}),
        available: true,
        installation: { active: true, organizationId: member.organizationId },
        ...(['OWNER', 'ADMIN'].includes(member.role)
          ? {}
          : { repositoryGrants: { some: { membershipId: member.id } } }),
      },
    })
    const githubIds = await this.github?.repositoryIds(
      session.identityId,
      member.organizationId
    )
    if (!repository || (githubIds && !githubIds.includes(repository.githubId)))
      await this.deny(session, permission)
    return repository!
  }
  private async deny(session: AuthenticatedSession, permission: string) {
    await this.prisma.auditEvent.create({
      data: {
        event: 'authorization_denied',
        actorId: session.identityId,
        metadata: {
          organizationId: session.organizationId ?? null,
          permission,
        },
      },
    })
    throw new ForbiddenException(
      'This resource is outside your authorized scope'
    )
  }
  // SessionGuard calls this after live session validation, before any controller or cache lookup.
  async authorizeRequest(request: Request, session: AuthenticatedSession) {
    const path = request.path.replace(/\/$/, '')
    const repo = /^\/github\/repositories\/([1-9]\d{0,15})(?:\/(.*))?$/.exec(
      path
    )
    if (repo) {
      const part = repo[2] ?? ''
      if (part === 'check-publications' || part.startsWith('check-publications/') || part === 'check-automation') {
        await this.requireRepository(session, repo[1], request.method === 'GET' ? 'policy.read' : 'policy.publish')
        return true
      }
      if (part === 'ruleset-deployments' || part.startsWith('ruleset-deployments/')) {
        await this.requireRepository(session, repo[1], request.method === 'GET' ? 'policy.read' : 'github.ruleset.manage')
        return true
      }
      if (part === 'gate-policies' || part.startsWith('gate-policies/')) {
        const action = /^gate-policies\/[^/]+\/(approve|publish)$/.exec(
          part
        )?.[1]
        const permission =
          request.method === 'GET'
            ? 'policy.read'
            : action
              ? 'policy.publish'
              : 'policy.draft'
        await this.requireRepository(session, repo[1], permission)
        return true
      }
      const permission =
        request.method === 'GET'
          ? part.startsWith('assessments') ||
            part === 'native-execution/status' ||
            part === 'native-execution/plan' ||
            part.startsWith('ci-evidence') ||
            part.startsWith('pull-requests') ||
            part === 'events'
            ? 'assessment.read'
            : part.startsWith('standards') ||
              part.startsWith('ci-bindings') ||
              part.startsWith('rulesets') ||
              part.startsWith('ruleset-drafts')
              ? 'policy.read'
              : 'repository.read'
          : part === 'assessments'
            ? 'assessment.run'
            : part === 'standards' || part === 'ci-bindings' || part.startsWith('ruleset-drafts')
              ? 'policy.draft'
              : part.startsWith('ci-evidence')
                ? 'evidence.manage'
                : 'repository.manage'
      await this.requireRepository(
        session,
        repo[1],
        permission,
        part !== 'selection'
      )
      return true
    }
    if (path === '/github/install') {
      await this.requireOrganization(session, 'repository.connect')
      return true
    }
    if (
      path === '/notifications' ||
      /^\/notifications\/(preferences|read-all|[a-zA-Z0-9-]{1,80}\/read)$/.test(path) ||
      path === '/github/repositories' ||
      path === '/github/repositories/overview' ||
      path === '/github/dashboard' ||
      path.startsWith('/contributors') ||
      path.startsWith('/organizations') ||
      path === '/standards/catalogue'
    )
      return false
    await this.deny(session, 'unmapped_route')
  }
}
