import { Module } from '@nestjs/common'
import { CacheModule } from '../cache/cache.module.js'
import { GitHubProviderService } from './github-provider.service.js'
@Module({
  imports: [CacheModule],
  providers: [GitHubProviderService],
  exports: [GitHubProviderService],
})
export class GitHubProviderModule {}
