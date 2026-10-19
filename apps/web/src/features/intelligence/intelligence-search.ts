export type AiSettingsTab = 'connections' | 'routing' | 'vapt-limits'

export function isAiSettingsTab(value: unknown): value is AiSettingsTab {
  return (
    typeof value === 'string' &&
    ['connections', 'routing', 'vapt-limits'].includes(value)
  )
}

export function validateIntelligenceSearch(search: Record<string, unknown>): {
  tab: AiSettingsTab | 'skills'
  model?: string
} {
  // Preserve legacy links until the route redirects them to the Skills page.
  if (search.tab === 'skills') return { tab: 'skills' }
  return {
    tab: isAiSettingsTab(search.tab) ? search.tab : 'connections',
    ...(typeof search.model === 'string' &&
    /^[a-f0-9-]{36}$/i.test(search.model)
      ? { model: search.model }
      : {}),
  }
}
