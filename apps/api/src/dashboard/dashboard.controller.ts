import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import { DashboardService } from './dashboard.service.js'

@Controller('github/dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async overview(
    @Query('days') days: unknown,
    @Query('repository') repository: unknown,
    @Req() request: Request & { preflytSession?: AuthenticatedSession },
  ) {
    return this.dashboard.overview(
      request.preflytSession!.identityId,
      days,
      repository,
    (
        await this.access.repositoryScope(
          request.preflytSession!.identityId,
          request.preflytSession!.organizationId,
        )
      ).map((r) => r.id),
    )
  }
}
