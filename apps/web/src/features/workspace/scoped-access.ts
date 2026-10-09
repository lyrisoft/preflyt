export type ScopedSession = {
  identityId?: string
  role?: string
  platformAdmin?: boolean
  organizationId?: string
  permissions?: string[]
  organizationWide?: boolean
  repositoryGrants?: string[]
}
export function canPerform(
  session: ScopedSession | undefined,
  permission: string,
  repositoryId?: string
) {
  return (
    !!session?.permissions?.includes(permission) &&
    (repositoryId === undefined ||
      !!session.organizationWide ||
      !!session.repositoryGrants?.includes(repositoryId))
  )
}
