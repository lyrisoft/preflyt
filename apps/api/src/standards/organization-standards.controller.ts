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
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsOptional,
  IsUUID,
  IsIn,
  Matches,
  ValidateNested,
  MaxLength,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { OrganizationStandardsService } from "./organization-standards.service.js";
class AiCheckDto {
  @Matches(/^ai-review-[a-f0-9-]{36}$/) id!: string;
  @IsString() @MaxLength(120) title!: string;
  @IsUUID() skillId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(["repository", "pull_request"], { each: true })
  stages!: string[];
}
class CheckDto {
  @IsOptional() @IsString() @MaxLength(4000) workflowCommand?: string;
  @IsOptional() @IsString() @MaxLength(512) reportPath?: string;
  @IsString() @MaxLength(80) id!: string;
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(4000) guidance!: string;
}
class StandardDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CheckDto)
  checks?: CheckDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AiCheckDto)
  aiChecks?: AiCheckDto[];
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(2000) description!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ruleIds!: string[];
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(80)
  expectedVersionId!: string | null;
}
@Controller("standards/library")
@UseGuards(SessionGuard)
export class OrganizationStandardsController {
  constructor(
    @Inject(OrganizationStandardsService)
    private readonly standards: OrganizationStandardsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    return this.standards.list(req.preflytSession);
  }
  @Post() @Header("Cache-Control", "no-store") create(
    @Body() input: StandardDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.standards.save(req.preflytSession, input);
  }
  @Post(":packId/versions") @Header("Cache-Control", "no-store") edit(
    @Param("packId") id: string,
    @Body() input: StandardDto,
    @Req() req: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.standards.save(req.preflytSession, input, id);
  }
}
