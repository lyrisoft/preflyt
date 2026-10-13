import { Controller, Get, Header, Inject, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js';
import { AuditLogService } from './audit-log.service.js';
@Controller('audit-log')
@UseGuards(SessionGuard)
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly audit: AuditLogService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Query() filters: Record<string, unknown>) {
    return this.audit.list(req.preflytSession, filters);
  }
}
