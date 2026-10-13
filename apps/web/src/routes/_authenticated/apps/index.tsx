import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Apps } from '@/features/apps'

const appsSearchSchema = z.object({
  github: z.enum(['connected', 'error']).optional().catch(undefined),
  account: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/apps/')({
  validateSearch: appsSearchSchema,
  component: Apps,
})
