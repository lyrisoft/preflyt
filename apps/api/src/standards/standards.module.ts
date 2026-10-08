import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { StandardsController } from './standards.controller.js'
import { StandardsService } from './standards.service.js'
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StandardsController],
  providers: [StandardsService],
})
export class StandardsModule {}
