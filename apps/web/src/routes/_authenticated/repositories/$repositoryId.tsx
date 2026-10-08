import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryProfilePage } from '@/features/repositories/repository-profile-page'

const repositorySearchSchema = z.object({
  tab: z
    .enum(['overview', 'standards', 'assessments', 'activity'])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute(
  '/_authenticated/repositories/$repositoryId'
)({ validateSearch: repositorySearchSchema, component: RepositoryProfilePage })
