import { createFileRoute, redirect } from '@tanstack/react-router'
import { API_BASE_URL } from '@/lib/api'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      credentials: 'include',
    }).catch(() => null)
    const session = response?.ok ? await response.json() : null
    if (!session?.authenticated) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
})
