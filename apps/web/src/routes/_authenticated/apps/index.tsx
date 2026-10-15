import { createFileRoute, redirect } from '@tanstack/react-router'
import { repositoriesSearchSchema } from '@/features/repositories/repositories-search'

/** Compatibility only; all current navigation uses /repositories. */
export const Route = createFileRoute('/_authenticated/apps/')({
  validateSearch: repositoriesSearchSchema,
  beforeLoad: ({ search, location }) => {
    throw redirect({
      to: '/repositories',
      search,
      hash: location.hash,
      replace: true,
    })
  },
})
