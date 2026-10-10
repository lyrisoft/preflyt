import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { NotificationChannelsService } from "./notification-channels.service.js";
type SessionRequest = Request & { preflytSession: AuthenticatedSession };
@Controller("notifications/channels")
@UseGuards(SessionGuard)
export class NotificationChannelsController {
  constructor(
    @Inject(NotificationChannelsService)
    private readonly channels: NotificationChannelsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private session(req: SessionRequest) {
    const organization = req.headers["x-preflyt-organization"];
    if (
      typeof organization !== "string" ||
      !organization ||
      organization !== req.preflytSession.organizationId
    )
      throw new ConflictException(
        "Your organization changed. Refresh this page and try again.",
      );
    return req.preflytSession;
  }
  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() req: SessionRequest) {
    return this.channels.list(this.session(req));
  }
  @Post()
  @Header("Cache-Control", "no-store")
  create(@Req() req: SessionRequest, @Body() body: unknown) {
    this.auth.assertOrigin(req.headers.origin);
    return this.channels.create(this.session(req), body);
  }
  @Patch(":id")
  @Header("Cache-Control", "no-store")
  update(
    @Req() req: SessionRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.channels.update(this.session(req), id, body);
  }
  @Delete(":id")
  @Header("Cache-Control", "no-store")
  remove(
    @Req() req: SessionRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.channels.remove(this.session(req), id, body);
  }
  @Post(":id/test")
  @Header("Cache-Control", "no-store")
  test(
    @Req() req: SessionRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    this.auth.assertOrigin(req.headers.origin);
    return this.channels.test(this.session(req), id, body);
  }
}
