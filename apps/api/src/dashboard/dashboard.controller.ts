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
import { DashboardService } from './dashboard.service.js'

@Controller('github/dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  overview(
    @Query('days') days: unknown,
    @Query('repository') repository: unknown,
    @Req() request: Request & { preflytSession?: AuthenticatedSession },
  ) {
    return this.dashboard.overview(
      request.preflytSession!.identityId,
      days,
      repository,
    )
  }
}
