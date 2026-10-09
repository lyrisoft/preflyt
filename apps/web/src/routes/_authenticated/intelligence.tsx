import { createFileRoute } from '@tanstack/react-router'
import { AiSettingsPage } from '@/features/intelligence/ai-settings'

export const Route = createFileRoute('/_authenticated/intelligence')({
  component: AiSettingsPage,
})
