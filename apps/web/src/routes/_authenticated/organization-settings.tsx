import { createFileRoute } from '@tanstack/react-router'
import { AppHeader } from '@/components/layout/app-header'
import { OrganizationSettingsPage } from '@/features/organization-settings/organization-settings-page'

export const Route = createFileRoute('/_authenticated/organization-settings')({
  validateSearch: (search: Record<string, unknown>) => ({
    identityLink:
      search.identityLink === 'confirm' || search.identityLink === 'failed'
        ? search.identityLink
        : undefined,
  }),
  component: () => (
    <>
      <AppHeader breadcrumbs={[{ label: 'Settings' }]} />
      <OrganizationSettingsPage />
    </>
  ),
})
