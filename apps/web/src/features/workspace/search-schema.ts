import z from 'zod'

export const workspaceSearchSchema = z.object({
  repository: z.string().optional().catch(undefined),
  tab: z
    .enum(['commits', 'pull-requests', 'activity'])
    .optional()
    .catch(undefined),
  gate: z
    .enum(['assessments', 'rulesets', 'checks'])
    .optional()
    .catch(undefined),
})
