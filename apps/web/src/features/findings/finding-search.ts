import { z } from 'zod'

export const findingsSearch = z.object({
  source: z.enum(['all', 'ci', 'health']).optional().catch(undefined),
  origin: z.enum(['health']).optional().catch(undefined),
  health: z.string().uuid().optional().catch(undefined),
  category: z
    .enum([
      'all',
      'security',
      'reliability',
      'maintainability',
      'duplication',
      'hotspot',
      'coverage',
      'tests',
      'check',
    ])
    .optional()
    .catch(undefined),
  kind: z.enum(['findings', 'gaps']).optional().catch(undefined),
  repository: z
    .string()
    .regex(/^(all|[1-9]\d{0,15})$/)
    .optional()
    .catch(undefined),
  severity: z
    .enum(['all', 'critical', 'high', 'medium', 'low', 'unknown'])
    .optional()
    .catch(undefined),
  triage: z
    .enum(['all', 'REPORTED', 'IN_REVIEW', 'RESOLVED'])
    .optional()
    .catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
})
export const findingDetailSearch = findingsSearch.extend({
  assessment: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,80}$/)
    .optional()
    .catch(undefined),
  origin: z.enum(['health']).optional().catch(undefined),
  health: z.string().uuid().optional().catch(undefined),
  back: z.string().max(800).optional().catch(undefined),
})
