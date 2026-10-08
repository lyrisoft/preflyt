import { createFileRoute } from '@tanstack/react-router'
import { RepositoryProfilePage } from '@/features/repositories/repository-profile-page'

export const Route = createFileRoute(
  '/_authenticated/repositories/$repositoryId'
)({ component: RepositoryProfilePage })
