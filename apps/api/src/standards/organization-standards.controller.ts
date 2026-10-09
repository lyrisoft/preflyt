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
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { OrganizationStandardsService } from './organization-standards.service.js'
class StandardDto {
  @IsString() @MaxLength(120) title!: string
  @IsString() @MaxLength(2000) description!: string
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ruleIds!: string[]
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedVersionId!: string | null
}
@Controller('standards/library')
@UseGuards(SessionGuard)
export class OrganizationStandardsController {
  constructor(
    @Inject(OrganizationStandardsService)
    private readonly standards: OrganizationStandardsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    return this.standards.list(req.preflytSession)
  }
  @Post() @Header('Cache-Control', 'no-store') create(
    @Body() input: StandardDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.standards.save(req.preflytSession, input)
  }
  @Post(':packId/versions') @Header('Cache-Control', 'no-store') edit(
    @Param('packId') id: string,
    @Body() input: StandardDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.standards.save(req.preflytSession, input, id)
  }
}
