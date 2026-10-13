import { createFileRoute } from '@tanstack/react-router'
import { GitHubOnboarding } from '@/features/auth/github-onboarding'

export const Route = createFileRoute('/github-onboarding')({
  component: GitHubOnboarding,
})
