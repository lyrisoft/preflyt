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
  ValidationPipe,
} from '@nestjs/common'
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { AuthService } from '../auth/auth.service.js'
import { CheckPublicationService } from './check-publication.service.js'
class PublishDto {
  @IsInt() @Min(1) @Max(2147483647) prNumber!: number
  @IsString() @MaxLength(80) assessmentId!: string
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash!: string
}
type AuthRequest = Request & { preflytSession: AuthenticatedSession }
@Controller('github/repositories/:repositoryId/check-publications')
@UseGuards(SessionGuard)
export class CheckPublicationController {
  constructor(
    @Inject(CheckPublicationService)
    private readonly checks: CheckPublicationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.checks.list(
      req.preflytSession,
      id,
      page === undefined ? 1 : Number(page),
      pageSize,
    )
  }
  @Get('results')
  @Header('Cache-Control', 'no-store')
  results(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.checks.prChecks(req.preflytSession, id, page === undefined ? 1 : Number(page), pageSize)
  }
  @Get('preview')
  @Header('Cache-Control', 'no-store')
  preview(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Query('pr') pr: string,
    @Query('assessmentId') assessmentId: string,
  ) {
    return this.checks.preview(req.preflytSession, id, Number(pr), assessmentId)
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  publish(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Body(
      new ValidationPipe({
        expectedType: PublishDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: PublishDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.checks.publish(req.preflytSession, id, body)
  }
}
