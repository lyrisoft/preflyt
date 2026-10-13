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
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { AiConfigurationService } from "./ai-configuration.service.js";
class ProviderDto {
  @IsOptional()
  @IsIn(["openai", "anthropic", "gemini", "deepseek"])
  preset?: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MaxLength(2048) baseUrl!: string;
  @IsIn(["local", "hosted"]) locality!: "local" | "hosted";
  @IsBoolean() requiresKey!: boolean;
  @IsString() @MaxLength(256) modelId!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4096) apiKey?: string;
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
}
class RouteDto {
  @IsOptional() @IsBoolean() automaticReviews?: boolean;
  @IsOptional() @IsBoolean() publishSummary?: boolean;
  @IsOptional() @IsBoolean() publishInline?: boolean;
  @ValidateIf((_o, v) => v !== null) @IsUUID() primaryId!: string | null;
  @ValidateIf((_o, v) => v !== null) @IsUUID() fallbackId!: string | null;
  @IsBoolean() enabled!: boolean;
  @IsBoolean() allowSource!: boolean;
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
}
class InheritDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
class PreviewDto {
  @IsString() @MaxLength(32) stage!: string;
  @IsBoolean() containsSource!: boolean;
}
type R = Request & { preflytSession: AuthenticatedSession };
@Controller("ai/configuration")
@UseGuards(SessionGuard)
export class AiConfigurationController {
  constructor(
    @Inject(AiConfigurationService) private readonly ai: AiConfigurationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(@Req() req: R) {
    return this.ai.list(req.preflytSession);
  }
  @Post("providers") @Header("Cache-Control", "no-store") create(
    @Body() body: ProviderDto,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.saveProvider(req.preflytSession, body);
  }
  @Post("providers/:id") @Header("Cache-Control", "no-store") edit(
    @Param("id") id: string,
    @Body() body: ProviderDto,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.saveProvider(req.preflytSession, body, id);
  }
  @Post("providers/:id/test") @Header("Cache-Control", "no-store") test(
    @Param("id") id: string,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.testProvider(req.preflytSession, id);
  }
  @Post("routes/:stage") @Header("Cache-Control", "no-store") route(
    @Param("stage") stage: string,
    @Body() body: RouteDto,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.saveRoute(req.preflytSession, stage, body);
  }
  @Post("routes/:stage/inherit") @Header("Cache-Control", "no-store") inherit(
    @Param("stage") stage: string,
    @Body() body: InheritDto,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.inheritRoute(
      req.preflytSession,
      stage,
      body.expectedRevision,
    );
  }
  @Post("preview") @Header("Cache-Control", "no-store") preview(
    @Body() body: PreviewDto,
    @Req() req: R,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.ai.preview(req.preflytSession, body.stage, body.containsSource);
  }
}
