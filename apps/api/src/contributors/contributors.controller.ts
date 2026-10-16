import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { ContributorsService } from './contributors.service.js'
type R = Request & { preflytSession: AuthenticatedSession }
@Controller('contributors')
@UseGuards(SessionGuard)
export class ContributorsController {
  constructor(
    @Inject(ContributorsService)
    private readonly contributors: ContributorsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Req() req: R,
    @Query() query: Record<string, unknown>,
  ) {
    return this.contributors.read(req.preflytSession, query)
  }
  @Header('Cache-Control', 'no-store') @Get(':id') detail(
    @Req() req: R,
    @Query() query: Record<string, unknown>,
    @Param('id') id: string,
  ) {
    return this.contributors.read(req.preflytSession, query, id)
  }
  @Post('repositories/:repositoryId/sync') @HttpCode(202) sync(
    @Req() req: R,
    @Param('repositoryId') id: string,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.contributors.backfill(req.preflytSession, id)
  }
}
