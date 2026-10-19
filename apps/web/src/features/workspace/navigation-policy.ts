import type { NavGroup } from '../../components/layout/types'
import { canPerform, type ScopedSession } from './scoped-access'

export function canAdminister(role?: string) {
  return ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '')
}

const destinationPermissions: Record<string, string[]> = {
  '/overview': ['assessment.read'],
  '/repositories': ['repository.read'],
  '/assessments': ['assessment.read'],
  '/findings': ['assessment.read'],
  '/contributors': ['contributors.read'],
  '/quality-gates': ['policy.read'],
  '/standards': ['policy.read'],
  '/policies': ['policy.read'],
  '/intelligence': ['ai.provider.manage', 'ai.routing.manage'],
  '/skills': ['ai.skills.read', 'ai.skills.manage', 'ai.skills.approve'],
  '/integrations': ['assessment.read', 'repository.connect'],
  '/teams': ['team.read'],
  '/access-control': ['organization.members.manage'],
  '/audit-log': ['audit.read'],
}

/** UI visibility follows the API session; role names never grant access. */
export function canViewDestination(
  session: ScopedSession | undefined,
  href: string
) {
  const destination = primaryDestination(href)
  if (destination === '/access-control' && session?.platformAdmin) return true
  const repositoryId = /^\/repositories\/([1-9]\d*)(?:\/|$)/.exec(href.split('?')[0])?.[1]
  if (repositoryId && !canPerform(session, 'repository.read', repositoryId)) return false
  const required = destinationPermissions[destination]
  if (!required) return true // Personal settings, notifications and other independent routes.
  return (
    !!session?.organizationId &&
    required.some((permission) => canPerform(session, permission))
  )
}

export function authorizedNavigation(
  groups: NavGroup[],
  session?: ScopedSession
) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.url && canViewDestination(session, item.url)
      ),
    }))
    .filter((group) => group.items.length > 0)
}

/** Highlight the direct sidebar destination of a nested page. */
export function primaryDestination(href: string) {
  const path = href.split('?')[0].replace(/\/$/, '') || '/'
  if (path === '/apps' || path.startsWith('/repositories/'))
    return '/repositories'
  return path === '/' ? '/' : `/${path.split('/')[1]}`
}
