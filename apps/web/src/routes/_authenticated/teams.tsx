import { createFileRoute } from '@tanstack/react-router'
import { TeamsPage } from '@/features/teams/teams-page'

export const Route = createFileRoute('/_authenticated/teams')({
  component: TeamsPage,
})
