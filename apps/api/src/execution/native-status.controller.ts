import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { NativeStatusService } from './native-status.service.js'
@Controller('github/repositories/:repositoryId/native-execution')
@UseGuards(SessionGuard)
export class NativeStatusController {
  constructor(
    @Inject(NativeStatusService) private readonly native: NativeStatusService,
  ) {}
  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param('repositoryId') id: string,
  ) {
    return this.native.status(req.preflytSession, id)
  }
}
