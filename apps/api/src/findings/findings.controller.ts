import { AuthService } from '../auth/auth.service.js'
import { Body, Controller, Get, Post, Param, Header, Inject, Query, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js'
import { FindingsService } from './findings.service.js'
@Controller('findings')
@UseGuards(SessionGuard)
export class FindingsController {
  constructor(@Inject(FindingsService) private readonly findings: FindingsService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Query() query: Record<string, unknown>) {
    return this.findings.list(req.preflytSession, query)
  }

  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query('assessment') assessment?: string, @Query('origin') origin?: string) {
    return this.findings.detail(req.preflytSession, id, assessment, origin)
  }
  @Get(':id/review') @Header('Cache-Control', 'no-store')
  review(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.findings.getReview(req.preflytSession, id, query)
  }
  @Post(':id/review') @Header('Cache-Control', 'no-store')
  setReview(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    this.auth.assertOrigin(req.headers.origin)
    return this.findings.setReview(req.preflytSession, id, query, body)
  }
  @Get(':id/ignore') @Header('Cache-Control', 'no-store')
  ignore(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.findings.getIgnore(req.preflytSession, id, query)
  }
  @Post(':id/ignore') @Header('Cache-Control', 'no-store')
  setIgnore(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query() query: Record<string, unknown>, @Body() body: unknown) {
    this.auth.assertOrigin(req.headers.origin)
    return this.findings.setIgnore(req.preflytSession, id, query, body)
  }
  @Get(':id/source') @Header('Cache-Control', 'no-store')
  source(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Query('assessment') assessment?: string, @Query('origin') origin?: string, @Query('location') location?: string) {
    return this.findings.source(req.preflytSession, id, assessment, origin, location)
  }
  @Get(':id/assignees') @Header('Cache-Control', 'no-store')
  assignees(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string) {
    return this.findings.assignees(req.preflytSession, id)
  }
  @Post(':id/triage') @Header('Cache-Control', 'no-store')
  triage(@Req() req: Request & { preflytSession: AuthenticatedSession }, @Param('id') id: string, @Body() body: { state: string; assigneeId?: string | null; note: string; expectedRevision: number }) {
    this.auth.assertOrigin(req.headers.origin)
    return this.findings.triage(req.preflytSession, id, body)
  }
}
