import z from 'zod'

export const workspaceSearchSchema = z.object({
  // TanStack's URL parser reads an unquoted numeric GitHub ID as a number.
  // Normalize it before validation so a native report link retains its scope.
  repository: z
    .union([
      z.string(),
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    ])
    .transform(String)
    .optional()
    .catch(undefined),
  assessment: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,80}$/)
    .optional()
    .catch(undefined),
  from: z.enum(['quality-gates']).optional().catch(undefined),
  policyScope: z
    .enum(['repository', 'team', 'organization'])
    .optional()
    .catch(undefined),
  team: z.string().optional().catch(undefined),
  policy: z.string().optional().catch(undefined),
  ruleset: z
    .union([
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      z
        .string()
        .regex(/^[1-9][0-9]*$/)
        .transform(Number)
        .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
    ])
    .optional()
    .catch(undefined),
  rulesetView: z
    .enum(['github', 'drafts', 'deployments'])
    .optional()
    .catch(undefined),
  tab: z
    .enum(['commits', 'pull-requests', 'activity'])
    .optional()
    .catch(undefined),
  gate: z
    .enum(['assessments', 'rulesets', 'checks'])
    .optional()
    .catch(undefined),
})
