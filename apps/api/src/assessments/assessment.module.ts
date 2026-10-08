import { CiBindingController } from './ci-binding.controller.js'
import { CiBindingService } from './ci-binding.service.js'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssessmentController } from './assessment.controller.js'
import { AssessmentService } from './assessment.service.js'
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AssessmentController, CiBindingController],
  providers: [AssessmentService, CiBindingService],
})
export class AssessmentModule {}
