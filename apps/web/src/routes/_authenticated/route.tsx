import { createFileRoute, redirect } from '@tanstack/react-router'
import { API_BASE_URL } from '@/lib/api'
import { checkSession } from '@/lib/session-request'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { SessionUnavailable } from '@/features/auth/session-unavailable'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const session = await checkSession(`${API_BASE_URL}/auth/session`)
    if (!session?.authenticated) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
  errorComponent: SessionUnavailable,
})
