import { OrganizationController } from './organization.controller.js'
import { AuthorizationService } from './authorization.service.js'
import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { OwnerAdminGuard, SessionGuard } from './session.guard.js'
@Module({
  controllers: [AuthController, OrganizationController],
  providers: [AuthService, SessionGuard, OwnerAdminGuard, AuthorizationService],
  exports: [AuthService, SessionGuard, OwnerAdminGuard, AuthorizationService],
})
export class AuthModule {}
