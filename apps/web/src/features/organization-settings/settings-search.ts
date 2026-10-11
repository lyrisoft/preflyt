export type SettingsTab =
  | 'manage'
  | 'workspace'
  | 'notifications'
  | 'appearance'
  | 'configuration'
  | 'pr-checks'

export type SettingsSearch = {
  tab?: SettingsTab
  identityLink?: 'confirm' | 'failed'
}

export function validateSettingsSearch(
  search: Record<string, unknown>
): SettingsSearch {
  return {
    tab: [
      'manage',
      'workspace',
      'notifications',
      'appearance',
      'configuration',
      'pr-checks',
    ].includes(String(search.tab))
      ? (search.tab as SettingsTab)
      : undefined,
    identityLink:
      search.identityLink === 'confirm' || search.identityLink === 'failed'
        ? search.identityLink
        : undefined,
  }
}
