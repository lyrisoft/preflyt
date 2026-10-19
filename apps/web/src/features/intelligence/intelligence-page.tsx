import { getRouteApi } from '@tanstack/react-router'
import { AiSettingsPage } from './ai-settings'
import { ModelDetailsPage } from './model-details-page'

const route = getRouteApi('/_authenticated/intelligence')

export function IntelligencePage() {
  const { tab, model } = route.useSearch()
  const navigate = route.useNavigate()
  if (tab === 'skills') return null
  if (model) return <ModelDetailsPage providerId={model} />
  return (
    <AiSettingsPage
      tab={tab}
      onTabChange={(selectedTab) => {
        void navigate({ search: { tab: selectedTab }, replace: true })
      }}
    />
  )
}
