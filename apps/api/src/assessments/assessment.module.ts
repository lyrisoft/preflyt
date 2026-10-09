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
  imports: [AuthModule, PrismaModule],
  controllers: [
    GatePolicyController,
    AssessmentController,
    CiBindingController,
    PullRequestController,
  ],
  providers: [GatePolicyService, AssessmentService, CiBindingService, PullRequestService],
})
export class AssessmentModule {}
