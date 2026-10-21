import type { WeeklyHealthInput } from './weekly-health-preferences.js'
import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
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
  @Get('summary') @Header('Cache-Control', 'no-store')
  summary(@Req() req: SessionRequest) { return this.inbox.summary(req.preflytSession) }
  @Get('preview') @Header('Cache-Control', 'no-store')
  preview(@Req() req: SessionRequest) { return this.inbox.preview(req.preflytSession) }
  @Get('weekly-health') @Header('Cache-Control', 'no-store')
  weeklyHealth(@Req() req: SessionRequest) { return this.inbox.weeklyHealth(req.preflytSession) }
  @Post('weekly-health') @Header('Cache-Control', 'no-store')
  saveWeeklyHealth(@Req() req: SessionRequest, @Body() body: WeeklyHealthInput) { this.auth.assertOrigin(req.headers.origin); return this.inbox.saveWeeklyHealth(req.preflytSession, body ?? {}) }
  @Get('preferences') @Header('Cache-Control', 'no-store')
  preferences(@Req() req: SessionRequest) { return this.inbox.preferences(req.preflytSession) }
  @Post('preferences') @Header('Cache-Control', 'no-store')
  savePreferences(@Req() req: SessionRequest, @Body() body: { assessments?: unknown; email?: unknown }) { this.auth.assertOrigin(req.headers.origin); return this.inbox.savePreferences(req.preflytSession, body?.assessments, body?.email) }
  @Post('email-address') @HttpCode(202) @Header('Cache-Control', 'no-store')
  requestEmail(@Req() req: SessionRequest, @Body() body: { email?: unknown }) { this.auth.assertOrigin(req.headers.origin); return this.inbox.requestEmail(req.preflytSession,body?.email) }
  @Post('email-address/verify') @Header('Cache-Control', 'no-store')
  verifyEmail(@Req() req: SessionRequest, @Body() body: { code?: unknown }) { this.auth.assertOrigin(req.headers.origin); return this.inbox.verifyEmail(req.preflytSession,body?.code) }
  @Post('email-address/remove') @Header('Cache-Control', 'no-store')
  removeEmail(@Req() req: SessionRequest) { this.auth.assertOrigin(req.headers.origin); return this.inbox.removeEmail(req.preflytSession) }
  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() req: SessionRequest, @Query() filters: InboxFilters) { return this.inbox.list(req.preflytSession, filters) }
  @Post('read-all') @Header('Cache-Control', 'no-store')
  readAll(@Req() req: SessionRequest) { this.auth.assertOrigin(req.headers.origin); return this.inbox.read(req.preflytSession) }
  @Post(':id/read') @Header('Cache-Control', 'no-store')
  read(@Req() req: SessionRequest, @Param('id') id: string) { this.auth.assertOrigin(req.headers.origin); return this.inbox.read(req.preflytSession, id) }
}
