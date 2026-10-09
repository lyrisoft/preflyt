import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { RepositoryProfilePage } from '@/features/repositories/repository-profile-page'

const repositorySearchSchema = z.object({
  assessment: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,80}$/)
    .optional()
    .catch(undefined),
  tab: z
    .enum(['overview', 'standards', 'assessments', 'activity'])
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute(
  '/_authenticated/repositories/$repositoryId'
)({ validateSearch: repositorySearchSchema, component: RepositoryProfilePage })
