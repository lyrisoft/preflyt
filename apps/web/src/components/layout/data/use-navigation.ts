import { authorizedNavigation } from '@/features/workspace/navigation-policy'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { canPerform } from '@/features/workspace/scoped-access'
import { sidebarData } from './sidebar-data'

export function useNavigation() {
  const session = useNavigationSession()
  return authorizedNavigation(
    sidebarData.navGroups,
    session.data?.role,
    !!session.data?.platformAdmin
  ).map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.url !== '/contributors' ||
        canPerform(session.data, 'contributors.read')
    ),
  }))
}
