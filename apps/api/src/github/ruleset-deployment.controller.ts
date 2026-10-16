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
import { IsString, Matches, MaxLength } from 'class-validator'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { AuthService } from '../auth/auth.service.js'
import { RulesetDeploymentService } from './ruleset-deployment.service.js'
class PreviewDto {
  @IsString() @MaxLength(80) draftId!: string
  @Matches(/^[a-f0-9]{64}$/) expectedDraftHash!: string
}
class ActionDto {
  @Matches(/^[a-f0-9]{64}$/) expectedPreviewHash!: string
}
type AuthRequest = Request & { preflytSession: AuthenticatedSession }
const validation = (expectedType: typeof PreviewDto | typeof ActionDto) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  })
@Controller('github/repositories/:repositoryId/ruleset-deployments')
@UseGuards(SessionGuard)
export class RulesetDeploymentController {
  constructor(
    @Inject(RulesetDeploymentService)
    private readonly deployments: RulesetDeploymentService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.deployments.list(
      req.preflytSession,
      id,
      page === undefined ? 1 : Number(page),
      pageSize,
    )
  }
  @Post('preview') preview(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Body(validation(PreviewDto)) body: PreviewDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.deployments.preview(
      req.preflytSession,
      id,
      body.draftId,
      body.expectedDraftHash,
    )
  }
  @Post(':deploymentId/approve') approve(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Param('deploymentId') deploymentId: string,
    @Body(validation(ActionDto)) body: ActionDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.deployments.approve(
      req.preflytSession,
      id,
      deploymentId,
      body.expectedPreviewHash,
    )
  }
  @Post(':deploymentId/deploy') deploy(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Param('deploymentId') deploymentId: string,
    @Body(validation(ActionDto)) body: ActionDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.deployments.deploy(
      req.preflytSession,
      id,
      deploymentId,
      body.expectedPreviewHash,
    )
  }
  @Post(':deploymentId/refresh') refresh(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Param('deploymentId') deploymentId: string,
    @Body(validation(ActionDto)) body: ActionDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.deployments.refresh(
      req.preflytSession,
      id,
      deploymentId,
      body.expectedPreviewHash,
    )
  }
  @Post(':deploymentId/rollback') rollback(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Param('deploymentId') deploymentId: string,
    @Body(validation(ActionDto)) body: ActionDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.deployments.rollback(
      req.preflytSession,
      id,
      deploymentId,
      body.expectedPreviewHash,
    )
  }
}
