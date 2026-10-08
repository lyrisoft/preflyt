import type { NavGroup } from '../../components/layout/types'

export function canAdminister(role?: string) {
  return ['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '')
}

export function authorizedNavigation(groups: NavGroup[], role?: string) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => canAdminister(role) || !item.adminOnly
      ),
    }))
    .filter((group) => group.items.length > 0)
}
