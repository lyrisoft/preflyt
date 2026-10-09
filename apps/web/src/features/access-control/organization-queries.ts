import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    retry: false,
    queryFn: async ({
      signal,
    }): Promise<{
      activeOrganizationId: string | null
      platformAdmin: boolean
      organizations: { id: string; name: string; role: string }[]
    }> => {
      const r = await fetch(`${API_BASE_URL}/organizations`, {
        credentials: 'include',
        signal,
        cache: 'no-store',
      })
      if (!r.ok) throw new Error('Organization memberships are unavailable.')
      return r.json()
    },
  })
}
