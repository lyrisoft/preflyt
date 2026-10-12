import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubProviderModule } from '../github/github-provider.module.js'
import { FindingSourceStore } from './finding-source-store.service.js'
@Module({ imports: [PrismaModule, GitHubProviderModule], providers: [FindingSourceStore], exports: [FindingSourceStore] })
export class FindingSourceStoreModule {}
