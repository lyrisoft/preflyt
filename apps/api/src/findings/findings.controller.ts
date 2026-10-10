import { Controller, Get, Header, Inject, Query, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js'
import { FindingsService } from './findings.service.js'
@Controller('findings')
@UseGuards(SessionGuard)
export class FindingsController {
  constructor(@Inject(FindingsService) private readonly findings: FindingsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Query() query: Record<string, unknown>) {
    return this.findings.list(req.preflytSession, query)
  }
}
