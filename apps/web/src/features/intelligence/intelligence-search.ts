export type AiSettingsTab = 'connections' | 'skills' | 'routing'

export function isAiSettingsTab(value: unknown): value is AiSettingsTab {
  return (
    typeof value === 'string' &&
    ['connections', 'skills', 'routing'].includes(value)
  )
}

export function validateIntelligenceSearch(search: Record<string, unknown>): {
  tab: AiSettingsTab
} {
  return { tab: isAiSettingsTab(search.tab) ? search.tab : 'connections' }
}
