import { createFileRoute } from '@tanstack/react-router'
import { CapabilityPage } from '@/features/marketing/capability-pages'

export const Route = createFileRoute('/product/repository-health')({
  component: () => <CapabilityPage capability='repository-health' />,
})
