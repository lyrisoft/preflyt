import { createFileRoute } from '@tanstack/react-router'
import { CapabilityPage } from '@/features/workspace/capability-page'

export const Route = createFileRoute('/_authenticated/access-control')({
  component: () => <CapabilityPage capability='access-control' />,
})
