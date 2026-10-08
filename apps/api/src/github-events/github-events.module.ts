import { CiArtifactController } from './ci-artifact.controller.js'
import { CiArtifactService } from './ci-artifact.service.js'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { GitHubWebhookController } from './github-webhook.controller.js'
import { GitHubWebhookService } from './github-webhook.service.js'

@Module({ imports: [AuthModule, PrismaModule], controllers: [GitHubWebhookController, CiArtifactController], providers: [GitHubWebhookService, CiArtifactService] })
export class GitHubEventsModule {}
