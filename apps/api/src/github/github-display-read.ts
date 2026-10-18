import { createHash, randomUUID } from 'node:crypto'
import { ForbiddenException, ServiceUnavailableException, Logger } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service.js'
import { GitHubRateLimitError } from './github-rate-limit.js'

export type DisplayOperation = 'branches' | 'rulesets' | 'ruleset' | 'insights' | 'workflows' | 'workflow' | 'standalone' | 'head'
export class GitHubDisplayReads {
  private readonly logger = new Logger(GitHubDisplayReads.name)
  constructor(private readonly db: PrismaService, private readonly fingerprint: () => string,
    private readonly load: (operation: DisplayOperation, installation: bigint, repository: bigint, args: any[]) => Promise<unknown>) {}
  private async authority(installationId: bigint, repositoryGithubId: bigint) {
    const repo = await this.db.gitHubRepository.findFirst({where: {githubId: repositoryGithubId, installationId, selected: true, available: true, installation: {active: true}}, include: {installation: true}})
    if (!repo) throw new ForbiddenException('Repository access is unavailable')
    return repo.installation.accessRevision
  }
  async read<T>(operation: DisplayOperation, installationId: bigint, repositoryGithubId: bigint, args: any[], refresh = false): Promise<T> {
    const accessRevision = await this.authority(installationId, repositoryGithubId)
    const fingerprint = this.fingerprint()
    const key = createHash('sha256').update(JSON.stringify([fingerprint, installationId.toString(), repositoryGithubId.toString(), accessRevision, operation, args])).digest('hex')
    const now = new Date()
    const row = await this.db.gitHubDisplayRead.upsert({where: {key}, create: {key, installationId, repositoryGithubId, accessRevision, fingerprint, operation, args}, update: {requestedAt: now}})
    // Repeated page visits cannot erase a server retry deadline or steal a worker lease.
    if (row.state === 'READY' && (refresh || !row.fetchedAt || now.getTime() - row.fetchedAt.getTime() > 300000))
      await this.db.gitHubDisplayRead.updateMany({where: {key, state: 'READY'}, data: {state: 'PENDING', nextAttemptAt: now}})
    if (accessRevision !== await this.authority(installationId, repositoryGithubId) || fingerprint !== this.fingerprint()) throw new ForbiddenException('Repository access changed. Reload the page.')
    if (row.state === 'INVALID') throw new ForbiddenException('GitHub access changed. Refresh the installation before trying again.')
    if (row.value !== null) return row.value as T
    const time = Date.now()
    const stallSeconds = Math.min(900, Math.max(30, Number(process.env.GITHUB_DISPLAY_STALL_SECONDS) || 180))
    const running = !!row.leaseUntil && row.leaseUntil.getTime() > time
    const limited = row.errorCode === 'GITHUB_RATE_LIMITED'
    const failed = row.errorCode === 'REFRESH_UNAVAILABLE'
    const stalled = !limited && !failed && !running && time - row.nextAttemptAt.getTime() >= stallSeconds * 1000
    const code = limited ? 'GITHUB_RATE_LIMITED' : failed ? 'GITHUB_SYNC_FAILED' : stalled ? 'GITHUB_SYNC_STALLED' : 'GITHUB_SYNC_PENDING'
    const message = limited ? 'GitHub has paused requests. Your refresh is queued until requests can resume.'
      : failed ? 'The background refresh failed. Preflyt will retry automatically. If this continues, ask your administrator to check the worker logs and GitHub connection.'
      : stalled ? 'The background refresh has not progressed. Ask your administrator to check that the worker is running and connected to the same database. This page will keep checking.'
      : running ? 'The background worker is fetching the latest GitHub data.'
      : 'Waiting for the background worker to load GitHub data.'
    throw new ServiceUnavailableException({statusCode: 503, code, message,
      retryAt: new Date(Math.max(time + (stalled || failed ? 30000 : 5000), row.nextAttemptAt.getTime())).toISOString()})
  }
  async reconcile() {
    const now = new Date()
    await this.db.gitHubDisplayRead.updateMany({where: {state: 'READY', requestedAt: {gt: new Date(Date.now() - 86400000)}, fetchedAt: {lt: new Date(Date.now() - 300000)}}, data: {state: 'PENDING', nextAttemptAt: now}})
    const rows = await this.db.gitHubDisplayRead.findMany({where: {state: 'PENDING', nextAttemptAt: {lte: now}, OR: [{leaseUntil: null}, {leaseUntil: {lt: now}}]}, orderBy: {nextAttemptAt: 'asc'}, take: Math.floor(Math.min(50, Math.max(1, Number(process.env.GITHUB_DISPLAY_REFRESH_BATCH) || 10)))})
    for (const row of rows) {
      const leaseToken = randomUUID()
      const owned = await this.db.gitHubDisplayRead.updateMany({where: {key: row.key, state: 'PENDING', nextAttemptAt: {lte: now}, OR: [{leaseUntil: null}, {leaseUntil: {lt: now}}]}, data: {leaseToken, leaseUntil: new Date(Date.now() + 120000)}})
      if (!owned.count) continue
      const where = {key: row.key, leaseToken}
      try {
        if (row.fingerprint !== this.fingerprint() || row.accessRevision !== await this.authority(row.installationId, row.repositoryGithubId)) throw new ForbiddenException()
        const value = await this.load(row.operation as DisplayOperation, row.installationId, row.repositoryGithubId, row.args as any[])
        if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) throw new Error('Display snapshot exceeds size limit')
        if (row.fingerprint !== this.fingerprint() || row.accessRevision !== await this.authority(row.installationId, row.repositoryGithubId)) throw new ForbiddenException()
        await this.db.gitHubDisplayRead.updateMany({where: {...where, generation: row.generation, leaseUntil: {gt: new Date()}}, data: {value: value as any, fetchedAt: new Date(), state: 'READY', errorCode: null, leaseToken: null, leaseUntil: null}})
        await this.db.gitHubDisplayRead.updateMany({where, data: {leaseToken: null, leaseUntil: null}})
      } catch (error) {
        const forbidden = error instanceof ForbiddenException
        const limited = error instanceof GitHubRateLimitError
        if (!limited && !forbidden) this.logger.warn({event: 'github.display_refresh_failed', operation: row.operation, repositoryId: row.repositoryGithubId.toString(), errorType: error instanceof Error ? error.name : 'UnknownError'})
        const retry = limited ? new Date((error.getResponse() as {retryAt: string}).retryAt) : new Date(Date.now() + 60000)
        await this.db.gitHubDisplayRead.updateMany({where, data: {state: forbidden ? 'INVALID' : 'PENDING', errorCode: limited ? 'GITHUB_RATE_LIMITED' : forbidden ? 'ACCESS_CHANGED' : 'REFRESH_UNAVAILABLE', nextAttemptAt: retry, leaseToken: null, leaseUntil: null}})
      }
    }
    // Bound storage to recently viewed data, without retaining obsolete source snapshots forever.
    await this.db.gitHubDisplayRead.deleteMany({where: {requestedAt: {lt: new Date(Date.now() - 7 * 86400000)}, OR: [{leaseUntil: null}, {leaseUntil: {lt: new Date()}}]}})
  }
}
