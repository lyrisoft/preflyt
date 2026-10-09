import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
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
  constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}
  async membership(identityId: string, organizationId?: string | null) {
    if (!organizationId) return null
    return this.prisma.organizationMembership.findFirst({
      where: { identityId, organizationId, active: true },
      include: { organization: true },
    })
  }
  async repositoryScope(
    identityId: string,
    organizationId?: string | null,
    permission = 'repository.read',
    selected = true,
  ) {
    const member = await this.membership(identityId, organizationId)
    if (!member || !rolePermissions[member.role]?.includes(permission))
      return []
    return this.prisma.gitHubRepository.findMany({
      where: {
        ...(selected ? { selected: true } : {}),
        available: true,
        installation: { active: true, organizationId: member.organizationId },
        ...(['OWNER', 'ADMIN'].includes(member.role)
          ? {}
          : { repositoryGrants: { some: { membershipId: member.id } } }),
      },
    })
  }
  async requireOrganization(session: AuthenticatedSession, permission: string) {
    const member = await this.membership(
      session.identityId,
      session.organizationId,
    )
    if (!member || !rolePermissions[member.role]?.includes(permission))
      await this.deny(session, permission)
    return member!
  }
  async requireRepository(
    session: AuthenticatedSession,
    id: string,
    permission: string,
    selected = true,
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
    if (!repository) await this.deny(session, permission)
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
      'This resource is outside your authorized scope',
    )
  }
  // SessionGuard calls this after live session validation, before any controller or cache lookup.
  async authorizeRequest(request: Request, session: AuthenticatedSession) {
    const path = request.path.replace(/\/$/, '')
    const repo = /^\/github\/repositories\/([1-9]\d{0,15})(?:\/(.*))?$/.exec(
      path,
    )
    if (repo) {
      const part = repo[2] ?? ''
      const permission =
        request.method === 'GET'
          ? part.startsWith('assessments') ||
            part.startsWith('ci-evidence') ||
            part.startsWith('pull-requests') ||
            part === 'events'
            ? 'assessment.read'
            : part.startsWith('standards') || part.startsWith('ci-bindings')
              ? 'policy.read'
              : 'repository.read'
          : part === 'assessments'
            ? 'assessment.run'
            : part === 'standards' || part === 'ci-bindings'
              ? 'policy.draft'
              : part.startsWith('ci-evidence')
                ? 'evidence.manage'
                : 'repository.manage'
      await this.requireRepository(
        session,
        repo[1],
        permission,
        part !== 'selection',
      )
      return true
    }
    if (path === '/github/install') {
      await this.requireOrganization(session, 'repository.connect')
      return true
    }
    if (
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
