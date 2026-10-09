import { createFileRoute } from '@tanstack/react-router'
import { ContributorDetailPage } from '@/features/contributors/contributors-page'
import { contributorSearchSchema } from '@/features/contributors/search-schema'

export const Route = createFileRoute(
  '/_authenticated/contributors/$contributorId'
)({ validateSearch: contributorSearchSchema, component: ContributorDetailPage })
