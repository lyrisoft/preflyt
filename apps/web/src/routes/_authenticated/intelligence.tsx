import {
  createFileRoute,
  redirect,
  type SearchSchemaInput,
} from '@tanstack/react-router'
import { IntelligencePage } from '@/features/intelligence/intelligence-page'
import { validateIntelligenceSearch } from '@/features/intelligence/intelligence-search'

export const Route = createFileRoute('/_authenticated/intelligence')({
  validateSearch: (search: { tab?: unknown } & SearchSchemaInput) =>
    validateIntelligenceSearch(search),
  beforeLoad: ({ search }) => {
    if (search.tab === 'skills')
      throw redirect({ to: '/skills', replace: true })
  },
  component: IntelligencePage,
})
