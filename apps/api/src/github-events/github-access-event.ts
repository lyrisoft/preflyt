import { BadRequestException } from '@nestjs/common'
export function normalizeAccessEvent(event: string, body: unknown) {
  if (!['installation', 'installation_repositories'].includes(event))
    return null
  const p = body as any
  const actions =
    event === 'installation'
      ? [
          'created',
          'deleted',
          'suspend',
          'unsuspend',
          'new_permissions_accepted',
        ]
      : ['added', 'removed']
  if (!actions.includes(p?.action)) return null
  if (!Number.isSafeInteger(p?.installation?.id) || p.installation.id < 1)
    throw new BadRequestException('Invalid installation lifecycle event')
  const removed =
    event === 'installation_repositories' ? p.repositories_removed : []
  if (
    !Array.isArray(removed) ||
    removed.length > 10000 ||
    removed.some((repo: any) => !Number.isSafeInteger(repo?.id) || repo.id < 1)
  )
    throw new BadRequestException('Invalid repository access event')
  return {
    installationId: BigInt(p.installation.id),
    event,
    action: p.action,
    repositorySelection:
      p.repository_selection ?? p.installation.repository_selection,
    removedIds: removed.map((repo: any) => BigInt(repo.id)),
    // all -> selected may omit the removed list; pause access until a full repair.
    pauseInstallation:
      (event === 'installation' && ['deleted', 'suspend'].includes(p.action)) ||
      (event === 'installation_repositories' &&
        p.repository_selection === 'selected' &&
        removed.length === 0 &&
        p.action === 'removed'),
  }
}
