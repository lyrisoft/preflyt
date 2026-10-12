import { createFileRoute } from '@tanstack/react-router'
import { CapabilityPage } from '@/features/marketing/capability-pages'

export const Route = createFileRoute('/product/standards-and-evidence')({
  component: () => <CapabilityPage capability='standards-and-evidence' />,
})
