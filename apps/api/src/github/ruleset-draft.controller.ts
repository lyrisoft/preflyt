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
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { RulesetDraftService } from './ruleset-draft.service.js'
class DraftDto {
  @IsString() @MaxLength(100) name!: string
  @IsIn(['STANDARD', 'STRICT', 'CUSTOM']) profile!:
    'STANDARD' | 'STRICT' | 'CUSTOM'
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(244, { each: true })
  branches!: string[]
  @IsInt() @Min(0) @Max(6) approvals!: number
  @IsBoolean() requirePullRequest!: boolean
  @IsBoolean() resolveConversations!: boolean
  @IsBoolean() preventForcePush!: boolean
  @IsBoolean() preventDeletion!: boolean
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedSelectionId!: string | null
}
class EditDto extends DraftDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedHash!: string
}
type AuthRequest = Request & { preflytSession: AuthenticatedSession }
@Controller('github/repositories/:repositoryId/ruleset-drafts')
@UseGuards(SessionGuard)
export class RulesetDraftController {
  constructor(
    @Inject(RulesetDraftService) private readonly drafts: RulesetDraftService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Query('page') page?: string,
  ) {
    return this.drafts.list(
      req.preflytSession,
      id,
      page === undefined ? 1 : Number(page),
    )
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Body(
      new ValidationPipe({
        expectedType: DraftDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: DraftDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.drafts.save(req.preflytSession, id, body)
  }
  @Post(':draftId/edit')
  @Header('Cache-Control', 'no-store')
  edit(
    @Req() req: AuthRequest,
    @Param('repositoryId') id: string,
    @Param('draftId') draftId: string,
    @Body(
      new ValidationPipe({
        expectedType: EditDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: EditDto,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    return this.drafts.save(req.preflytSession, id, body, {
      id: draftId,
      expectedHash: body.expectedHash,
    })
  }
}
