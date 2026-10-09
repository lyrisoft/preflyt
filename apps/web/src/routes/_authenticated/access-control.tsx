import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AccessControlPage } from '@/features/access-control/access-control-page'

const searchSchema = z.object({
  tab: z.enum(['people', 'github']).catch('people'),
  githubLink: z.enum(['confirm', 'failed']).optional().catch(undefined),
})
export const Route = createFileRoute('/_authenticated/access-control')({
  validateSearch: (search) => searchSchema.parse(search),
  component: AccessControlPage,
})
