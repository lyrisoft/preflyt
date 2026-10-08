import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'

export function useNavigationSession() {
  return useQuery({
    queryKey: ['profile-view-session'],
    queryFn: async ({ signal }): Promise<{ role?: string }> => {
      const response = await fetch(`${API_BASE_URL}/auth/session`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('Session details are unavailable.')
      return response.json() as Promise<{ role?: string }>
    },
    retry: false,
  })
}

export { canAdminister } from './navigation-policy'
