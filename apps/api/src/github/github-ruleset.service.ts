import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { GitHubProviderService } from './github-provider.service.js'

@Injectable()
export class GitHubRulesetService {
  constructor(
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly provider: GitHubProviderService,
  ) {}
  async list(
    session: AuthenticatedSession,
    repositoryId: string,
    page: number,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException('Invalid ruleset page')
    const repository = await this.access.requireRepository(
      session,
      repositoryId,
      'policy.read',
    )
    const result = await this.provider.listRepositoryRulesets(
      repository.installationId,
      repository.githubId,
      page,
    )
    await this.access.requireRepository(session, repositoryId, 'policy.read')
    return result
  }
  async detail(
    session: AuthenticatedSession,
    repositoryId: string,
    id: number,
  ) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Invalid ruleset ID')
    const repository = await this.access.requireRepository(
      session,
      repositoryId,
      'policy.read',
    )
    const result = await this.provider.getRepositoryRuleset(
      repository.installationId,
      repository.githubId,
      id,
    )
    await this.access.requireRepository(session, repositoryId, 'policy.read')
    return result
  }
}
