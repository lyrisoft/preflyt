import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: z.object({
    tab: z
      .enum(['overview', 'repositories', 'pull-requests', 'health'])
      .catch('overview')
      .optional(),
    days: z.enum(['7', '30', '90', '180']).optional(),
    repository: z
      .string()
      .regex(/^[1-9]\d{0,15}$/)
      .optional(),
  }),
  component: Dashboard,
})
