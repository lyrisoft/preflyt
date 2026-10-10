import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/app-header'
import { OrganizationSettingsPage } from '@/features/organization-settings/organization-settings-page'

export const Route = createFileRoute('/_authenticated/organization-settings')({
  component: () => (
    <>
      <AppHeader breadcrumbs={[{ label: 'Settings' }]} />
      <OrganizationSettingsPage />
    </>
  ),
})
