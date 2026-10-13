import { createFileRoute } from '@tanstack/react-router'
import { SelfHostingPage } from '@/features/marketing/capability-pages'

export const Route = createFileRoute('/self-hosting')({
  component: SelfHostingPage,
})
