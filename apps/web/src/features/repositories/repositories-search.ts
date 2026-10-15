import z from 'zod'

/** Shared with the legacy redirect so GitHub connection feedback survives old links. */
export const repositoriesSearchSchema = z.object({
  github: z.enum(['connected', 'error']).optional().catch(undefined),
  account: z.string().optional().catch(undefined),
})
