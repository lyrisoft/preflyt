import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { FindingAiGuidanceService } from "./finding-ai-guidance.service.js";
class FindingScope {
  @IsIn(["ci", "health"]) origin!: "ci" | "health";
  @Matches(/^[1-9]\d{0,15}$/) repositoryId!: string;
  @IsString() @MaxLength(80) @Matches(/^[a-zA-Z0-9_-]+$/) assessmentId!: string;
  @Matches(/^[a-f0-9]{64}$/) findingId!: string;
}
class GuidanceRequest extends FindingScope {
  @IsOptional() @IsBoolean() retry?: boolean;
}
const validate = (type: typeof FindingScope) =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    expectedType: type,
  });
@Controller("finding-guidance")
@UseGuards(SessionGuard)
export class FindingAiGuidanceController {
  constructor(
    @Inject(FindingAiGuidanceService)
    private guidance: FindingAiGuidanceService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  get(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Query(validate(FindingScope)) scope: FindingScope,
  ) {
    return this.guidance.get(req.preflytSession, scope);
  }
  @Post()
  @Header("Cache-Control", "no-store")
  request(
    @Req() req: Request & { preflytSession: AuthenticatedSession },
    @Body(validate(GuidanceRequest)) body: GuidanceRequest,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    const { retry, ...scope } = body;
    return this.guidance.request(req.preflytSession, scope, retry);
  }
}
