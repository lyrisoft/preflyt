import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/app-header'
import { OrganizationSettingsPage } from '@/features/organization-settings/organization-settings-page'
import { validateSettingsSearch } from '@/features/organization-settings/settings-search'

export const Route = createFileRoute('/_authenticated/organization-settings')({
  validateSearch: validateSettingsSearch,
  component: () => (
    <>
      <AppHeader breadcrumbs={[{ label: 'Settings' }]} />
      <OrganizationSettingsPage />
    </>
  ),
})
