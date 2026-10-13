import { API_BASE_URL } from '@/lib/api'

export async function importContributorActivity(
  repositories: readonly { githubId: string; fullName: string }[]
) {
  const imported: string[] = []
  const failures: { repository: string; message: string }[] = []
  let truncated = false
  for (const repository of repositories) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/contributors/repositories/${encodeURIComponent(repository.githubId)}/sync`,
        { method: 'POST', credentials: 'include' }
      )
      if (!response.ok) {
        let message = 'Import failed. Check repository access and retry.'
        try {
          const body = (await response.json()) as { message?: unknown }
          if (typeof body.message === 'string') message = body.message
        } catch {
          /* Use the fallback when the API response has no JSON body. */
        }
        throw new Error(message)
      }
      const result = (await response.json()) as { truncated: boolean }
      truncated ||= result.truncated
      imported.push(repository.fullName)
    } catch (error) {
      failures.push({
        repository: repository.fullName,
        message: error instanceof Error ? error.message : 'Import failed.',
      })
    }
  }
  return { imported, failures, truncated }
}
