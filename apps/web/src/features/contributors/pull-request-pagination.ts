type PullRequestObservation = {
  id: string
  relationship: string
  repositoryId: string
  pullRequestNumber: number | null
  observedAt: string
}
export function paginatePullRequests<T extends PullRequestObservation>(
  rows: T[],
  requestedPage: number,
  pageSize = 20
) {
  const unique = new Map<string, T>()
  const ordered = [...rows].sort(
    (a, b) =>
      b.observedAt.localeCompare(a.observedAt) || b.id.localeCompare(a.id)
  )
  for (const row of ordered) {
    if (row.relationship !== 'PR_AUTHOR' || !row.pullRequestNumber) continue
    const key = `${row.repositoryId}:${row.pullRequestNumber}`
    if (!unique.has(key)) unique.set(key, row)
  }
  const all = [...unique.values()],
    total = all.length
  const pages = Math.max(1, Math.ceil(total / pageSize)),
    page = Math.max(1, Math.min(requestedPage, pages))
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pages,
    pageSize,
  }
}
