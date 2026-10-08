import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { OwnerAdminGuard, SessionGuard } from './session.guard.js'
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, OwnerAdminGuard],
  exports: [AuthService, SessionGuard, OwnerAdminGuard],
})
export class AuthModule {}
