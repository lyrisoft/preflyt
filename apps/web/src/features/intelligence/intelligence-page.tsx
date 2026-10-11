import { getRouteApi } from '@tanstack/react-router'
import { AiSettingsPage } from './ai-settings'

const route = getRouteApi('/_authenticated/intelligence')

export function IntelligencePage() {
  const { tab } = route.useSearch()
  const navigate = route.useNavigate()
  if (tab === 'skills') return null
  return (
    <AiSettingsPage
      tab={tab}
      onTabChange={(selectedTab) => {
        void navigate({ search: { tab: selectedTab }, replace: true })
      }}
    />
  )
}
