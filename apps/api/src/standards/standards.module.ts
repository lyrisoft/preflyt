import { OrganizationStandardsController } from './organization-standards.controller.js'
import { OrganizationStandardsService } from './organization-standards.service.js'
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { StandardsController } from './standards.controller.js'
import { StandardsService } from './standards.service.js'
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StandardsController, OrganizationStandardsController],
  providers: [StandardsService, OrganizationStandardsService],
})
export class StandardsModule {}
