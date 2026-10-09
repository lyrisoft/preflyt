import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js'
import { NotificationsService, type InboxFilters } from './notifications.service.js'
type SessionRequest = Request & { preflytSession: AuthenticatedSession }
@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly inbox: NotificationsService,
    @Inject(AuthService) private readonly auth: AuthService) {}
  @Get('preferences') @Header('Cache-Control', 'no-store')
  preferences(@Req() req: SessionRequest) { return this.inbox.preferences(req.preflytSession) }
  @Post('preferences') @Header('Cache-Control', 'no-store')
  savePreferences(@Req() req: SessionRequest, @Body() body: { assessments?: unknown; email?: unknown }) { this.auth.assertOrigin(req.headers.origin); return this.inbox.savePreferences(req.preflytSession, body?.assessments, body?.email) }
  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() req: SessionRequest, @Query() filters: InboxFilters) { return this.inbox.list(req.preflytSession, filters) }
  @Post('read-all') @Header('Cache-Control', 'no-store')
  readAll(@Req() req: SessionRequest) { this.auth.assertOrigin(req.headers.origin); return this.inbox.read(req.preflytSession) }
  @Post(':id/read') @Header('Cache-Control', 'no-store')
  read(@Req() req: SessionRequest, @Param('id') id: string) { this.auth.assertOrigin(req.headers.origin); return this.inbox.read(req.preflytSession, id) }
}
