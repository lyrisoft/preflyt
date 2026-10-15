import { FindingSourceStoreModule } from '../findings/finding-source-store.module.js'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubProviderModule } from '../github/github-provider.module.js'
import { NativeStatusService } from '../execution/native-status.service.js'
import { HealthScannerClient } from './health-scanner-client.js'
import { RepositoryHealthService } from './repository-health.service.js'
import { RepositoryHealthController } from './repository-health.controller.js'
@Module({ imports: [AuthModule, PrismaModule, GitHubProviderModule, FindingSourceStoreModule], controllers: [RepositoryHealthController], providers: [RepositoryHealthService, NativeStatusService, HealthScannerClient], exports: [RepositoryHealthService] })
export class HealthModule {}
