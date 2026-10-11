export type AiSettingsTab = 'connections' | 'routing'

export function isAiSettingsTab(value: unknown): value is AiSettingsTab {
  return typeof value === 'string' && ['connections', 'routing'].includes(value)
}

export function validateIntelligenceSearch(search: Record<string, unknown>): {
  tab: AiSettingsTab | 'skills'
} {
  // Preserve legacy links until the route redirects them to the Skills page.
  if (search.tab === 'skills') return { tab: 'skills' }
  return { tab: isAiSettingsTab(search.tab) ? search.tab : 'connections' }
}
