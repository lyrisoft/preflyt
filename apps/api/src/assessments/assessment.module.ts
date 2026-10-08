import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AssessmentController } from './assessment.controller.js'
import { AssessmentService } from './assessment.service.js'
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
})
export class AssessmentModule {}
