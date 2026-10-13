import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'
import { dashboardSearchSchema } from '@/features/dashboard/search'

export const Route = createFileRoute('/_authenticated/overview')({
  validateSearch: dashboardSearchSchema,
  component: Dashboard,
})
