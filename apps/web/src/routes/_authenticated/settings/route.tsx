import { createFileRoute, redirect } from '@tanstack/react-router'
import { validateSettingsSearch } from '@/features/organization-settings/settings-search'

// Old bookmarks go to Preflyt settings instead of rendering template forms.
export const Route = createFileRoute('/_authenticated/settings')({
  validateSearch: validateSettingsSearch,
  beforeLoad: ({ location, search }) => {
    const section = location.pathname.replace(/\/$/, '').split('/').pop()
    const tab =
      section === 'notifications'
        ? 'notifications'
        : section === 'appearance' || section === 'display'
          ? 'appearance'
          : search.tab

    throw redirect({
      to: '/organization-settings',
      search: { ...search, tab },
      replace: true,
    })
  },
})
