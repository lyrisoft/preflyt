import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  SessionGuard,
  OwnerAdminGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { CiBindingService } from './ci-binding.service.js'
class BindingDto {
  @IsString() @MaxLength(80) ruleId!: string
  @IsIn(['check_run', 'workflow_run']) kind!: 'check_run' | 'workflow_run'
  @IsOptional() @IsString() @MaxLength(16) appId?: string
  @IsOptional() @IsString() @MaxLength(256) checkName?: string
  @IsOptional() @IsString() @MaxLength(16) workflowId?: string
}
class AdoptionDto {
  @IsString() @MaxLength(80) expectedSelectionId!: string
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedBindingId!: string | null
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => BindingDto)
  bindings!: BindingDto[]
}
@Controller('github/repositories/:repositoryId/ci-bindings')
@UseGuards(SessionGuard)
export class CiBindingController {
  constructor(
    @Inject(CiBindingService) private readonly bindings: CiBindingService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') get(
    @Param('repositoryId') id: string,
  ) {
    return this.bindings.get(id)
  }
  @Post() @UseGuards(OwnerAdminGuard) @Header('Cache-Control', 'no-store') save(
    @Param('repositoryId') id: string,
    @Body() body: AdoptionDto,
    @Req() request: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(request.headers.origin)
    return this.bindings.save(id, body, request.preflytSession.identityId)
  }
}
