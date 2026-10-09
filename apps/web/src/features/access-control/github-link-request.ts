import { API_BASE_URL } from '@/lib/api'

export async function githubLinkRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(API_BASE_URL + '/auth/github/' + path, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : 'Could not link GitHub. Try again from this page.'
    )
  return data
}
export function beginOrganizationLink() {
  window.location.assign(
    API_BASE_URL +
      '/auth/github/login?link=workspace&redirect=%2Faccess-control%3Ftab%3Dgithub'
  )
}
