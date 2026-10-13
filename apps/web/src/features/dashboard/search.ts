import z from 'zod'

export const dashboardSearchSchema = z.object({
  tab: z
    .enum(['overview', 'repositories', 'pull-requests', 'health'])
    .catch('overview')
    .optional(),
  days: z.enum(['7', '30', '90', '180']).optional(),
  repository: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .optional(),
})

// TanStack stringifies numeric-looking search strings as JSON strings.
export function legacyDashboardSearch(searchStr: string) {
  const query = new URLSearchParams(searchStr)
  if (!['tab', 'days', 'repository'].some((key) => query.has(key))) return null
  const value = (key: string) => {
    const raw = query.get(key)
    if (raw === null) return undefined
    try {
      const decoded: unknown = JSON.parse(raw)
      return typeof decoded === 'string' || typeof decoded === 'number'
        ? String(decoded)
        : raw
    } catch {
      return raw
    }
  }
  const days = value('days')
  const repository = value('repository')
  return dashboardSearchSchema.parse({
    tab: value('tab'),
    days: days && ['7', '30', '90', '180'].includes(days) ? days : undefined,
    repository:
      repository && /^[1-9]\d{0,15}$/.test(repository) ? repository : undefined,
  })
}
