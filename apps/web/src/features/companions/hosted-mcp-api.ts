import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type McpConnection = {
  id: string
  clientName: string
  repositories: string[]
  scopes: string
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string
}
export async function mcpCall<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/mcp-connections${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(
      error?.error_description ||
        error?.message ||
        'Could not load the MCP connection. Try again.'
    )
  }
  return response.json()
}
export function useMcpConnections(enabled = true) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'hosted-mcp-connections',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    enabled,
    queryFn: () => mcpCall<McpConnection[]>(''),
    refetchInterval: 10000,
    retry: false,
    gcTime: 0,
  })
}
