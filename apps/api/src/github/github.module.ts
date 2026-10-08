import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubController } from './github.controller.js'
import { GitHubProviderService } from './github-provider.service.js'
import { GitHubService } from './github.service.js'

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [GitHubController],
  providers: [GitHubProviderService, GitHubService],
})
export class GitHubModule {}
