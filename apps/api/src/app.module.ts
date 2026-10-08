import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module.js'
import { HealthController } from './health/health.controller.js'
import { PrismaModule } from './prisma/prisma.module.js'
@Module({ imports: [PrismaModule, AuthModule], controllers: [HealthController] })
export class AppModule {}
