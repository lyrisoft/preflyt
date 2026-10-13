import { API_BASE_URL } from '@/lib/api'
import type {
  Standards,
  Selection,
} from '@/features/repositories/repository-queries'

export async function createFirstReport(
  repositoryId: string,
  requestKey: (inputs: string) => string,
  progress: (message: string) => void
) {
  const base = `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}`
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
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
      const message =
        response.status === 409
          ? 'Repository settings changed. Review its standards before trying again.'
          : response.status === 403
            ? 'Repository access changed. Refresh the page to check your permissions.'
            : 'Could not finish the report. Saved progress is kept; try again or open the repository for details.'
      throw new Error(message)
    }
    return response.json() as Promise<T>
  }
  progress('Checking saved progress…')
  let standards = await request<Standards>('/standards')
  if (!standards.profileSnapshot) {
    progress('Inspecting repository configuration…')
    await request('/profile', {})
    standards = await request<Standards>('/standards')
  }
  const sourceSha = standards.profileSnapshot?.sourceSha
  if (!sourceSha || !/^[a-f0-9]{40}$/i.test(sourceSha))
    throw new Error('Inspect the repository before creating a report.')
  let selection = standards.selection
  if (!selection) {
    if (!standards.recommendations.length)
      throw new Error(
        'Choose standards for this repository before creating a report.'
      )
    progress('Saving recommended standards…')
    selection = await request<Selection>('/standards', {
      profile: 'RECOMMENDED',
      expectedSelectionId: null,
      packs: standards.recommendations.map(({ id, version }) => ({
        id,
        version,
      })),
    })
  } else if (!standards.selectionIntegrity) {
    throw new Error(
      'Review the saved standard versions before creating a report.'
    )
  }
  progress('Creating your report…')
  return request<{ assessment: { id: string } }>('/assessments', {
    sourceSha,
    expectedSelectionId: selection.id,
    requestKey: requestKey(`${sourceSha}:${selection.id}`),
    mappings: [],
  })
}
