import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { RetentionService } from "./retention.service.js";
type RetentionRequest = Request & { preflytSession: AuthenticatedSession };
@Controller("retention")
@UseGuards(SessionGuard)
export class RetentionController {
  constructor(
    @Inject(RetentionService) private readonly retention: RetentionService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") get(
    @Req() req: RetentionRequest,
  ) {
    return this.retention.get(req.preflytSession);
  }
  @Post("preview") @Header("Cache-Control", "no-store") preview(
    @Req() req: RetentionRequest,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.retention.preview(req.preflytSession, body);
  }
  @Patch() @Header("Cache-Control", "no-store") save(
    @Req() req: RetentionRequest,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.retention.save(req.preflytSession, body);
  }
  @Post("cleanup") @Header("Cache-Control", "no-store") cleanup(
    @Req() req: RetentionRequest,
    @Body() body: { revision?: unknown },
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.retention.requestCleanup(req.preflytSession, body?.revision);
  }
}
