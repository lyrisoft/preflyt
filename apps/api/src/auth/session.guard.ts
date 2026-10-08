import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service.js'

export type AuthenticatedSession = {
  authenticated: true
  identityId: string
  subject: string
  email: string | null
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER'
}

type AuthenticatedRequest = Request & { preflytSession?: AuthenticatedSession }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.cookies?.[this.auth.sessionCookieName] as
      | string
      | undefined
    const session = await this.auth.currentSession(token)
    if (!session.authenticated) {
      throw new UnauthorizedException('An active Preflyt session is required')
    }
    request.preflytSession = session
    return true
  }
}

@Injectable()
export class OwnerAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>()
    if (!['OWNER', 'ADMIN'].includes(request.preflytSession?.role ?? '')) {
      throw new ForbiddenException('Owner or Admin role required')
    }
    return true
  }
}
