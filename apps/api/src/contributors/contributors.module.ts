import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { GitHubModule } from '../github/github.module.js'
import { ContributorsController } from './contributors.controller.js'
import { ContributorsService } from './contributors.service.js'
@Module({
  imports: [AuthModule, GitHubModule],
  controllers: [ContributorsController],
  providers: [ContributorsService],
})
export class ContributorsModule {}
