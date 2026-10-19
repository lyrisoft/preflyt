import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { CompanionService } from "./companion.service.js";
type SessionRequest = Request & { preflytSession: AuthenticatedSession };
@Controller("companions")
@UseGuards(SessionGuard)
export class CompanionController {
  constructor(
    @Inject(CompanionService) private service: CompanionService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(@Req() r: SessionRequest) {
    return this.service.list(r.preflytSession);
  }
  @Get("consent") @Header("Cache-Control", "no-store") consent(
    @Req() r: SessionRequest,
    @Query("id") id: string,
  ) {
    return this.service.consent(r.preflytSession, id);
  }
  @Post("approve") @Header("Cache-Control", "no-store") approve(
    @Req() r: SessionRequest,
    @Body() b: unknown,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.service.approve(r.preflytSession, b);
  }
  @Post("revoke") revoke(@Req() r: SessionRequest, @Body() b: any) {
    this.auth.assertOrigin(r.headers.origin);
    return this.service.revoke(
      r.preflytSession,
      typeof b?.id === "string" ? b.id : "",
    );
  }
  @Get("jobs") @Header("Cache-Control", "no-store") jobs(
    @Req() r: SessionRequest,
    @Query() q: Record<string, unknown>,
  ) {
    return this.service.jobs(r.preflytSession, q);
  }
  @Post("jobs") enqueue(@Req() r: SessionRequest, @Body() b: unknown) {
    this.auth.assertOrigin(r.headers.origin);
    return this.service.enqueue(r.preflytSession, b);
  }
  @Post("cancel") cancel(@Req() r: SessionRequest, @Body() b: any) {
    this.auth.assertOrigin(r.headers.origin);
    return this.service.cancel(
      r.preflytSession,
      typeof b?.id === "string" ? b.id : "",
    );
  }
  @Get("download") async download(@Res() res: Response) {
    res
      .set({
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=utf-8",
        "Content-Disposition": 'attachment; filename="preflyt-companion.mjs"',
        "X-Content-Type-Options": "nosniff",
      })
      .send(await readFile(fileURLToPath(new URL("../../resources/preflyt-companion.mjs", import.meta.url)), "utf8"));
  }
}
@Controller("companion-oauth")
export class CompanionOAuthController {
  constructor(
    @Inject(CompanionService) private service: CompanionService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  private origin(r: Request) {
    if (r.headers.origin) this.auth.assertOrigin(r.headers.origin);
  }
  @Post("authorize") @Header("Cache-Control", "no-store") begin(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    this.origin(r);
    return this.service.begin(b);
  }
  @Post("token") @Header("Cache-Control", "no-store") token(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    this.origin(r);
    return this.service.token(b);
  }
  @Post("poll") @Header("Cache-Control", "no-store") poll(@Req() r: Request) {
    this.origin(r);
    return this.service.poll(r.headers.authorization);
  }
  @Post("update") @Header("Cache-Control", "no-store") update(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    this.origin(r);
    return this.service.update(r.headers.authorization, b);
  }
}
