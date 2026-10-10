import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateIf,
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
import {
  adoptionProfiles,
  catalogue,
  type AdoptionProfile,
} from './catalogue.js'
import { StandardsService } from './standards.service.js'
class PackDto {
  @IsString() @MaxLength(80) id!: string
  @IsString() @MaxLength(40) version!: string
}
class SelectionDto {
  @IsIn(adoptionProfiles) profile!: AdoptionProfile
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PackDto)
  packs!: PackDto[]
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedSelectionId!: string | null
}
@Controller()
@UseGuards(SessionGuard)
export class StandardsController {
  constructor(
    @Inject(StandardsService) private readonly standards: StandardsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('standards/catalogue')
  @Header('Cache-Control', 'no-store')
  catalogue() {
    return {
      catalogue,
      adoptionProfiles,
      enforcement: 'observe',
      qualityGate: null,
    }
  }
  @Get('github/repositories/:repositoryId/standards')
  @Header('Cache-Control', 'no-store')
  get(@Param('repositoryId') id: string, @Query('policy') policyId?: string) {
    return this.standards.get(id, policyId)
  }
  @Post('github/repositories/:repositoryId/standards')
  @UseGuards(OwnerAdminGuard)
  @Header('Cache-Control', 'no-store')
  assign(
    @Param('repositoryId') id: string,
    @Body() body: SelectionDto,
    @Req() request: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(request.headers.origin)
    return this.standards.assign(id, body, request.preflytSession.identityId)
  }
}
