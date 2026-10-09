import { TeamsModule } from './teams/teams.module.js'
import { IntelligenceModule } from './intelligence/intelligence.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { ContributorsModule } from './contributors/contributors.module.js'
import { AssessmentModule } from './assessments/assessment.module.js'
import { StandardsModule } from './standards/standards.module.js'
import { Module } from '@nestjs/common'
import { GitHubEventsModule } from './github-events/github-events.module.js'
import { AuthModule } from './auth/auth.module.js'
import { HealthController } from './health/health.controller.js'
import { GitHubModule } from './github/github.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
@Module({
  imports: [TeamsModule, IntelligenceModule, NotificationsModule, ContributorsModule,
    PrismaModule, AuthModule, GitHubModule, GitHubEventsModule, StandardsModule, AssessmentModule],
  controllers: [HealthController],
})
export class AppModule {}
