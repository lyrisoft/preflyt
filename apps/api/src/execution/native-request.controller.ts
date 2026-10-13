import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { AuthService } from '../auth/auth.service.js'
import { NativeRequestService } from './native-request.service.js'
class CheckRequestDto {
  @IsUUID('4') requestKey!: string
  @Matches(/^[a-f0-9]{40}$/) expectedSourceSha!: string
  @IsString() @MaxLength(100) expectedSelectionId!: string
  @Matches(/^[a-f0-9]{64}$/) expectedPlanHash!: string
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ruleIds!: string[]
}
@Controller('github/repositories/:repositoryId/native-execution/requests')
@UseGuards(SessionGuard)
export class NativeRequestController {
  constructor(
    @Inject(NativeRequestService)
    private readonly requests: NativeRequestService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param('repositoryId') repositoryId: string,
    @Query('page') page?: string,
  ) {
    return this.requests.list(
      req.preflytSession,
      repositoryId,
      page === undefined ? 1 : Number(page),
    )
  }
  @Post() @Header('Cache-Control', 'no-store') create(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param('repositoryId') repositoryId: string,
    @Body() input: CheckRequestDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.requests.request(req.preflytSession, repositoryId, input)
  }
  @Post(':id/cancel') @Header('Cache-Control', 'no-store') cancel(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param('repositoryId') repositoryId: string,
    @Param('id') id: string,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.requests.cancel(req.preflytSession, repositoryId, id)
  }
}
