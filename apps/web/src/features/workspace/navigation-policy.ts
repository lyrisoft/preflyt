import type { NavGroup } from '../../components/layout/types'

export function canAdminister(role?: string) {
  return ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '')
}

export function authorizedNavigation(
  groups: NavGroup[],
  role?: string,
  platformAdmin = false
) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          canAdminister(role) ||
          !item.adminOnly ||
          (platformAdmin && item.url === '/access-control')
      ),
    }))
    .filter((group) => group.items.length > 0)
}
