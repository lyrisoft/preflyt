import { createFileRoute } from '@tanstack/react-router'
import { AccessControlPage } from '@/features/access-control/access-control-page'

export const Route = createFileRoute('/_authenticated/access-control')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'github' ? 'github' : 'people',
  }),
  component: AccessControlPage,
})
