import { createFileRoute } from '@tanstack/react-router'
import { SetupOwner } from '@/features/auth/setup-owner'

export const Route = createFileRoute('/setup')({
  component: SetupOwner,
})
