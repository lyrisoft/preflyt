import { DashboardController } from '../dashboard/dashboard.controller.js'
import { DashboardService } from '../dashboard/dashboard.service.js'
import { Module } from '@nestjs/common'
import { CacheModule } from '../cache/cache.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubController } from './github.controller.js'
import { GitHubProviderService } from './github-provider.service.js'
import { RepositoryProfileController } from './repository-profile.controller.js'
import { RepositoryProfileService } from './repository-profile.service.js'
import { GitHubService } from './github.service.js'

@Module({
  imports: [AuthModule, PrismaModule, CacheModule],
  controllers: [
    GitHubController,
    RepositoryProfileController,
    DashboardController,
  ],
  providers: [
    GitHubProviderService,
    GitHubService,
    RepositoryProfileService,
    DashboardService,
  ],
})
export class GitHubModule {}
