import { authorizedNavigation } from '@/features/workspace/navigation-policy'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { sidebarData } from './sidebar-data'

export function useNavigation() {
  const session = useNavigationSession()
  return authorizedNavigation(sidebarData.navGroups, session.data)
}
