import { App } from '@octokit/app'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { governanceConfiguration } from './governance-config.js'
import { GitHubRequestLimiter } from './github-rate-limit.js'
import { digest } from '../assessments/assessment-digest.js'
/** Stable projection includes every mutable field. API-added defaults are retained in receipts. */
export function rulesetProjection(value: Record<string, any>) {
  return {
    name: value.name,
    target: value.target,
    enforcement: value.enforcement,
    conditions: value.conditions,
    rules: value.rules,
    bypass_actors: value.bypass_actors ?? [],
  }
}
export function matchesRuleset(expected: unknown, actual: unknown): boolean {
  if (expected === null || typeof expected !== 'object')
    return expected === actual
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((v, i) => matchesRuleset(v, actual[i]))
    )
  if (!actual || typeof actual !== 'object' || Array.isArray(actual))
    return false
  return Object.entries(expected).every(([k, v]) =>
    matchesRuleset(v, (actual as Record<string, unknown>)[k]),
  )
}
export class GovernanceProvider {
  private readonly limiter = new GitHubRequestLimiter()
  async open(fullName: string) {
    const config = governanceConfiguration(fullName)
    const organization = fullName.split('/')[0]
    if (!/^[a-zA-Z0-9-]+$/.test(organization))
      throw new ForbiddenException('Invalid GitHub organization')
    const app = new App({ appId: config.appId, privateKey: config.privateKey })
    const request = async (
      route: string,
      options: Record<string, unknown> = {},
    ) =>
      this.limiter.run(
        `governance:${config.appId}:${config.installationId}`,
        () =>
          app.octokit.request(route, {
            ...options,
            request: { timeout: 10_000 },
          }),
        route.startsWith('GET '),
      )
    const installation = (
      await request('GET /app/installations/{installation_id}', {
        installation_id: Number(config.installationId),
      })
    ).data as Record<string, any>
    if (
      String(installation.app_id) !== config.appId ||
      installation.account?.type !== 'Organization' ||
      installation.account?.login?.toLowerCase() !==
        organization.toLowerCase() ||
      installation.suspended_at ||
      installation.permissions?.organization_administration !== 'write'
    )
      throw new ForbiddenException(
        'The governance App needs organization Administration: write on this organization',
      )
    const response = await request(
      'POST /app/installations/{installation_id}/access_tokens',
      {
        installation_id: Number(config.installationId),
        permissions: { organization_administration: 'write' },
      },
    )
    const token = (response.data as Record<string, any>).token
    if (typeof token !== 'string' || !token)
      throw new ServiceUnavailableException(
        'Governance credentials unavailable',
      )
    const root = `https://api.github.com/orgs/${encodeURIComponent(organization)}/rulesets`
    const call = async (method: string, path = '', body?: unknown) => {
      const result = await this.limiter.run(
        `governance:${config.appId}:${config.installationId}`,
        () =>
          fetch(root + path, {
            method,
            signal: AbortSignal.timeout(10_000),
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2026-03-10',
              ...(body === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          }),
        method === 'GET',
      )
      if (!result.ok)
        throw new ServiceUnavailableException(
          'GitHub ruleset request could not be verified. Refresh before retrying',
        )
      return (await result.json()) as Record<string, any>
    }
    const read = async (id: string) => {
      if (!/^[1-9]\d{0,15}$/.test(id))
        throw new ForbiddenException('Invalid managed ruleset ID')
      const value = await call('GET', `/${id}`)
      if (
        String(value.id) !== id ||
        value.source_type !== 'Organization' ||
        value.source?.toLowerCase() !== organization.toLowerCase()
      )
        throw new ForbiddenException('Ruleset ownership could not be verified')
      return {
        id,
        definition: rulesetProjection(value),
        hash: digest(rulesetProjection(value)),
      }
    }
    return {
      config,
      read,
      async create(definition: Record<string, any>) {
        // Recover an unknown POST by unique managed name before issuing another write.
        let found: string | undefined,
          complete = false
        for (let page = 1; page <= 10; page++) {
          const rows = await call('GET', `?per_page=100&page=${page}`)
          if (!Array.isArray(rows) || rows.length > 100)
            throw new ServiceUnavailableException(
              'Ruleset inventory unavailable',
            )
          for (const row of rows)
            if (row.name === definition.name) {
              if (found)
                throw new ServiceUnavailableException(
                  'Duplicate managed rulesets need review',
                )
              found = String(row.id)
            }
          if (rows.length < 100) {
            complete = true
            break
          }
        }
        if (!complete)
          throw new ServiceUnavailableException(
            'Ruleset inventory exceeds the recovery limit',
          )
        if (!found) {
          const created = await call('POST', '', definition)
          found = String(created.id)
        }
        const receipt = await read(found)
        if (!matchesRuleset(definition, receipt.definition))
          throw new ServiceUnavailableException(
            'GitHub ruleset differs from the approved definition',
          )
        return receipt
      },
      async disable(id: string, expectedHash: string) {
        const before = await read(id)
        if (before.hash !== expectedHash)
          throw new ForbiddenException(
            'The ruleset changed outside Preflyt. Review drift before rollback',
          )
        const definition = { ...before.definition, enforcement: 'disabled' }
        await call('PUT', `/${id}`, definition)
        const after = await read(id)
        if (!matchesRuleset(definition, after.definition))
          throw new ServiceUnavailableException(
            'Rollback could not be verified',
          )
        return after
      },
    }
  }
}
