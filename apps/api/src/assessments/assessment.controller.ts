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
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  OwnerAdminGuard,
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { previewGate } from './gate-preview.js'
import { AssessmentService } from './assessment.service.js'
class MappingDto {
  @IsString() @MaxLength(80) ruleId!: string
  @IsString() @Matches(/^[a-f0-9-]{36}$/i) deliveryId!: string
}
class AssessmentDto {
  @IsString() @Matches(/^[a-f0-9]{40}$/i) sourceSha!: string
  @IsString() @MaxLength(80) expectedSelectionId!: string
  @IsUUID() requestKey!: string
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => MappingDto)
  mappings!: MappingDto[]
}
@Controller('github/repositories/:repositoryId/assessments')
@UseGuards(SessionGuard)
export class AssessmentController {
  constructor(
    @Inject(AssessmentService) private readonly assessments: AssessmentService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Param('repositoryId') repo: string, @Query('sha') sha?: string) {
    return this.assessments.list(repo, sha)
  }
  @Get(':assessmentId')
  @Header('Cache-Control', 'no-store')
  get(@Param('repositoryId') repo: string, @Param('assessmentId') id: string) {
    return this.assessments.get(repo, id)
  }
  @Get(':assessmentId/gate-preview')
  @Header('Cache-Control', 'no-store')
  async preview(@Param('repositoryId') repo: string, @Param('assessmentId') id: string) {
    return previewGate(await this.assessments.get(repo, id))
  }
  @Post()
  @UseGuards(OwnerAdminGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Param('repositoryId') repo: string,
    @Body() body: AssessmentDto,
    @Req() request: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(request.headers.origin)
    return this.assessments.create(
      repo,
      body,
      request.preflytSession.identityId,
    )
  }
}
