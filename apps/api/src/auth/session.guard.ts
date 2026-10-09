import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthorizationService } from './authorization.service.js'
import { AuthService } from './auth.service.js'

export type AuthenticatedSession = {
  authenticated: true
  identityId: string
  subject: string
  email: string | null
  role: string
  organizationId?: string | null
  platformAdmin?: boolean
}

type AuthenticatedRequest = Request & {
  preflytSession?: AuthenticatedSession
  preflytPermissionAuthorized?: boolean
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.cookies?.[this.auth.sessionCookieName] as
      string | undefined
    const session = await this.auth.currentSession(token)
    if (!session.authenticated) {
      throw new UnauthorizedException('An active Preflyt session is required')
    }
    request.preflytSession = session
    request.preflytPermissionAuthorized =
      await this.authorization.authorizeRequest(request, session)
    return true
  }
}

@Injectable()
export class OwnerAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (request.preflytPermissionAuthorized) return true
    if (
      !['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(
        request.preflytSession?.role ?? ''
      )
    ) {
      throw new ForbiddenException('Owner or Admin role required')
    }
    return true
  }
}
