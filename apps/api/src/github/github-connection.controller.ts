import {
  Controller,
  Get,
  Header,
  Inject,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { SessionGuard } from "../auth/session.guard.js";
import { GitHubConnectionService } from "./github-connection.service.js";

@Controller("github/connection")
export class GitHubConnectionController {
  constructor(
    @Inject(GitHubConnectionService)
    private readonly connection: GitHubConnectionService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "no-store")
  @Header("Referrer-Policy", "no-referrer")
  async begin(@Req() req: Request, @Res() res: Response) {
    const result = await this.connection.begin(
      req.cookies?.[this.connection.sessionCookieName],
    );
    res.cookie(this.connection.cookieName, result.binding, {
      httpOnly: true,
      secure: this.connection.secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(result.url);
  }
}
