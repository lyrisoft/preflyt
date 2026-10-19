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
import { AuthService } from "../auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../auth/session.guard.js";
import { McpOAuthService } from "./mcp-oauth.service.js";
type SessionRequest = Request & { preflytSession: AuthenticatedSession };
@Controller()
export class McpDiscoveryController {
  constructor(@Inject(McpOAuthService) private oauth: McpOAuthService) {}
  @Get([
    ".well-known/oauth-protected-resource",
    ".well-known/oauth-protected-resource/*path",
  ])
  @Header("Cache-Control", "no-store")
  resource() {
    return this.oauth.resourceMetadata();
  }
  @Get([
    ".well-known/oauth-authorization-server",
    ".well-known/oauth-authorization-server/*path",
  ])
  @Header("Cache-Control", "no-store")
  metadata() {
    return this.oauth.metadata();
  }
}
@Controller("mcp-oauth")
export class McpOAuthController {
  constructor(
    @Inject(McpOAuthService) private oauth: McpOAuthService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  private origin(r: Request) {
    if (r.headers.origin) this.auth.assertOrigin(r.headers.origin);
  }
  @Post("register") @Header("Cache-Control", "no-store") register(
    @Req() r: Request,
    @Body() b: unknown,
  ) {
    this.origin(r);
    return this.oauth.register(b);
  }
  @Get("authorize") @Header("Cache-Control", "no-store") async authorize(
    @Query() q: Record<string, unknown>,
    @Res() r: Response,
  ) {
    r.set("Referrer-Policy", "no-referrer").redirect(
      302,
      await this.oauth.authorize(q),
    );
  }
  @Post("token") @Header("Cache-Control", "no-store") async token(
    @Req() r: Request,
    @Body() b: unknown,
    @Res() res: Response,
  ) {
    this.origin(r);
    res
      .set({ "Cache-Control": "no-store", Pragma: "no-cache" })
      .status(200)
      .json(await this.oauth.exchange(b));
  }
  @Post("revoke") async revoke(
    @Req() r: Request,
    @Body() b: unknown,
    @Res() res: Response,
  ) {
    this.origin(r);
    await this.oauth.revokeToken(b);
    res.status(200).end();
  }
}
@Controller("mcp-connections")
@UseGuards(SessionGuard)
export class McpConnectionsController {
  constructor(
    @Inject(McpOAuthService) private oauth: McpOAuthService,
    @Inject(AuthService) private auth: AuthService,
  ) {}
  @Get() @Header("Cache-Control", "no-store") list(@Req() r: SessionRequest) {
    return this.oauth.list(r.preflytSession);
  }
  @Get("consent") @Header("Cache-Control", "no-store") consent(
    @Req() r: SessionRequest,
    @Query("id") id: string,
  ) {
    return this.oauth.consent(r.preflytSession, id);
  }
  @Post("approve") @Header("Cache-Control", "no-store") approve(
    @Req() r: SessionRequest,
    @Body() b: unknown,
  ) {
    this.auth.assertOrigin(r.headers.origin);
    return this.oauth.approve(r.preflytSession, b);
  }
  @Post("revoke") revoke(@Req() r: SessionRequest, @Body() b: any) {
    this.auth.assertOrigin(r.headers.origin);
    return this.oauth.revokeConnection(
      r.preflytSession,
      typeof b?.id === "string" ? b.id : "",
    );
  }
}
