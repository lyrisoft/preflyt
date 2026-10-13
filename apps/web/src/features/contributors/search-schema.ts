import { z } from 'zod'

export const contributorSearchSchema = z.object({
  days: z.enum(['7', '30', '90', '180']).optional().default('30').catch('30'),
  repository: z
    .string()
    .regex(/^(all|[1-9]\d{0,15})$/)
    .optional()
    .default('all')
    .catch('all'),
  kind: z
    .enum(['all', 'HUMAN', 'BOT', 'UNKNOWN'])
    .optional()
    .default('all')
    .catch('all'),
  relationship: z
    .enum([
      'all',
      'PR_AUTHOR',
      'REVIEWER',
      'COMMIT_AUTHOR',
      'COMMITTER',
      'MERGE_ACTOR',
    ])
    .optional()
    .default('all')
    .catch('all'),
  q: z.string().max(100).optional().default('').catch(''),
  page: z.coerce.number().int().min(1).optional().default(1).catch(1),
  tab: z
    .enum([
      'overview',
      'repositories',
      'pull-requests',
      'reviews',
      'policy-evidence',
      'activity',
    ])
    .optional()
    .default('overview')
    .catch('overview'),
})
export type ContributorSearch = z.infer<typeof contributorSearchSchema>
