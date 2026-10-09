import { createFileRoute } from '@tanstack/react-router'
import { ContributorsPage } from '@/features/contributors/contributors-page'
import { contributorSearchSchema } from '@/features/contributors/search-schema'

export const Route = createFileRoute('/_authenticated/contributors/')({
  validateSearch: contributorSearchSchema,
  component: ContributorsPage,
})
