import { GitHubProviderModule } from '../github/github-provider.module.js'
import { CacheModule } from '../cache/cache.module.js'
import { GitHubIdentityProvider } from './github-identity-provider.js'
import { GitHubUserAccessService } from './github-user-access.service.js'
import { GitHubLoginService } from './github-login.service.js'
import { GitHubLoginController } from './github-login.controller.js'
import { OrganizationController } from './organization.controller.js'
import { AuthorizationService } from './authorization.service.js'
import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { OwnerAdminGuard, SessionGuard } from './session.guard.js'
@Module({
  imports: [GitHubProviderModule, CacheModule],
  controllers: [AuthController, OrganizationController, GitHubLoginController],
  providers: [
    GitHubIdentityProvider,
    GitHubUserAccessService,
    GitHubLoginService,
    AuthService,
    SessionGuard,
    OwnerAdminGuard,
    AuthorizationService,
  ],
  exports: [AuthService, SessionGuard, OwnerAdminGuard, AuthorizationService],
})
export class AuthModule {}
