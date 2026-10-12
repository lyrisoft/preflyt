import { createFileRoute, redirect } from '@tanstack/react-router'
import { legacyDashboardSearch } from '@/features/dashboard/search'
import { MarketingHomepage } from '@/features/marketing'

export const Route = createFileRoute('/')({
  beforeLoad: ({ location }) => {
    const search = legacyDashboardSearch(location.searchStr)
    if (search) {
      throw redirect({ to: '/overview', search, replace: true })
    }
  },
  component: MarketingHomepage,
})
