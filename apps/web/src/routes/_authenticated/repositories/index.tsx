import { createFileRoute } from '@tanstack/react-router'
import { Apps } from '@/features/apps'
import { repositoriesSearchSchema } from '@/features/repositories/repositories-search'

export const Route = createFileRoute('/_authenticated/repositories/')({
  validateSearch: repositoriesSearchSchema,
  component: Apps,
})
