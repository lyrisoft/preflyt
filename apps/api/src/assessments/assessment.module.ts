import { NativeRequestController } from '../execution/native-request.controller.js'
import { NativeRequestService } from '../execution/native-request.service.js'
import { NativePlanService } from '../execution/native-plan.service.js'
import { NativeStatusController } from '../execution/native-status.controller.js'
import { NativeStatusService } from '../execution/native-status.service.js'
import { RulesetDeploymentController } from '../github/ruleset-deployment.controller.js'
import { RulesetDeploymentService } from '../github/ruleset-deployment.service.js'
import { ReadinessAutomationController } from './readiness-automation.controller.js'
import { ReadinessAutomationService } from './readiness-automation.service.js'
import { CheckPublicationController } from './check-publication.controller.js'
import { CheckPublicationService } from './check-publication.service.js'
import { GitHubProviderModule } from '../github/github-provider.module.js'
import { PullRequestController } from './pull-request.controller.js'
import { PullRequestService } from './pull-request.service.js'
import { CiBindingController } from './ci-binding.controller.js'
import { CiBindingService } from './ci-binding.service.js'
import { GatePolicyController } from './gate-policy.controller.js'
import { GatePolicyService } from './gate-policy.service.js'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssessmentController } from './assessment.controller.js'
import { AssessmentService } from './assessment.service.js'
@Module({
  imports: [AuthModule, PrismaModule, GitHubProviderModule],
  controllers: [
    NativeRequestController,
    NativeStatusController,
    RulesetDeploymentController,
    ReadinessAutomationController,
    CheckPublicationController,
    GatePolicyController,
    AssessmentController,
    CiBindingController,
    PullRequestController,
  ],
  providers: [
    NativeRequestService,
    NativePlanService,
    NativeStatusService,
    RulesetDeploymentService,
    ReadinessAutomationService,
    CheckPublicationService,
    GatePolicyService,
    AssessmentService,
    CiBindingService,
    PullRequestService,
  ],
})
export class AssessmentModule {}
