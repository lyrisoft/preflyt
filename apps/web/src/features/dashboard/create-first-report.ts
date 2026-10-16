import { API_BASE_URL } from '@/lib/api'
import type {
  Selection,
  Standards,
} from '@/features/repositories/repository-queries'

async function request<T>(
  repositoryId: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(
    `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}${path}`,
    {
      credentials: 'include',
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }
  )
  if (!response.ok) {
    throw new Error(
      response.status === 409
        ? 'Repository settings changed. Review its standards before trying again.'
        : response.status === 403
          ? 'Repository access changed. Refresh the page to check your permissions.'
          : 'Could not finish this step. Saved progress is kept; try again or open the repository for details.'
    )
  }
  return response.json() as Promise<T>
}

export async function inspectFirstRepository(repositoryId: string) {
  await request(repositoryId, '/profile', {})
  return request<Standards>(repositoryId, '/standards')
}

export async function saveFirstStandards(
  repositoryId: string,
  packs: Selection['packs']
) {
  if (!packs.length)
    throw new Error('Choose at least one standard to continue.')
  // A concurrent selection must be reviewed rather than silently overwritten.
  await request<Selection>(repositoryId, '/standards', {
    profile: 'RECOMMENDED',
    expectedSelectionId: null,
    packs,
  })
  return request<Standards>(repositoryId, '/standards')
}

export async function createFirstReport(
  repositoryId: string,
  requestKey: (inputs: string) => string,
  progress: (message: string) => void
) {
  progress('Checking saved progress…')
  const standards = await request<Standards>(repositoryId, '/standards')
  const sourceSha = standards.profileSnapshot?.sourceSha
  if (!sourceSha || !/^[a-f0-9]{40}$/i.test(sourceSha))
    throw new Error('Inspect the repository before creating an assessment.')
  const selection = standards.selection
  if (!selection)
    throw new Error('Review and save standards before creating an assessment.')
  if (!standards.selectionIntegrity)
    throw new Error(
      'Review the saved standard versions before creating an assessment.'
    )
  progress('Creating your assessment…')
  return request<{ assessment: { id: string } }>(repositoryId, '/assessments', {
    sourceSha,
    expectedSelectionId: selection.id,
    requestKey: requestKey(`${sourceSha}:${selection.id}`),
    mappings: [],
  })
}
