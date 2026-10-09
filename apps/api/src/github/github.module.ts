import { RulesetHistoryService } from './ruleset-history.service.js'
import { RulesetDraftController } from './ruleset-draft.controller.js'
import { RulesetDraftService } from './ruleset-draft.service.js'
import { GitHubRulesetController } from './github-ruleset.controller.js'
import { GitHubRulesetService } from './github-ruleset.service.js'
import { DashboardController } from '../dashboard/dashboard.controller.js'
import { DashboardService } from '../dashboard/dashboard.service.js'
import { Module } from '@nestjs/common'
import { CacheModule } from '../cache/cache.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubController } from './github.controller.js'
import { GitHubProviderModule } from './github-provider.module.js'
import { RepositoryProfileController } from './repository-profile.controller.js'
import { RepositoryProfileService } from './repository-profile.service.js'
import { GitHubService } from './github.service.js'

@Module({
  imports: [AuthModule, PrismaModule, CacheModule, GitHubProviderModule],
  controllers: [
    GitHubController,
    GitHubRulesetController,
    RulesetDraftController,
    RepositoryProfileController,
    DashboardController,
  ],
  exports: [GitHubProviderModule],
  providers: [RulesetHistoryService, RulesetDraftService, GitHubRulesetService, GitHubService, RepositoryProfileService, DashboardService],
})
export class GitHubModule {}
