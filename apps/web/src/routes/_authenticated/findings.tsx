import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/app-header'
import { FindingsPage } from '@/features/findings/findings-page'

export const Route = createFileRoute('/_authenticated/findings')({
  component: () => (
    <>
      <AppHeader breadcrumbs={[{ label: 'Findings' }]} />
      <FindingsPage />
    </>
  ),
})
