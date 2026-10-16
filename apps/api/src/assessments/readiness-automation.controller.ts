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
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, Min } from "class-validator";
import type { Request } from "express";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { ReadinessAutomationService } from "./readiness-automation.service.js";
class SettingsDto {
  @IsOptional() @IsBoolean() pipelineComments?: boolean;
  @IsOptional() @IsBoolean() aiReviews?: boolean;
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) expectedRevision!: number;
}
@Controller("github/repositories/:repositoryId/check-automation")
@UseGuards(SessionGuard)
export class ReadinessAutomationController {
  constructor(
    @Inject(ReadinessAutomationService)
    private readonly automation: ReadinessAutomationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param("repositoryId") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.automation.list(
      req.preflytSession,
      id,
      page === undefined ? 1 : Number(page),
      pageSize,
    );
  }
  @Post() @Header("Cache-Control", "no-store") configure(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Param("repositoryId") id: string,
    @Body(
      new ValidationPipe({
        expectedType: SettingsDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: SettingsDto,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.automation.configure(
      req.preflytSession,
      id,
      body.enabled,
      body.expectedRevision,
      body.pipelineComments,
      body.aiReviews,
    );
  }
}
