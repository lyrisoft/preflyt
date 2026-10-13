import { createFileRoute } from '@tanstack/react-router'
import { CapabilityPage } from '@/features/marketing/capability-pages'

export const Route = createFileRoute('/product/merge-protection')({
  component: () => <CapabilityPage capability='merge-protection' />,
})
