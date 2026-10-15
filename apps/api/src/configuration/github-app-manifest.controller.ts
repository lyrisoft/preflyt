import { Body, Controller, Get, Header, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsString, MaxLength, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js';
import { resolveWebOrigin } from '../config/web-origin.js';
import { GitHubAppManifestService } from './github-app-manifest.service.js';
class ManifestDto {
  @IsInt() @Min(1) expectedRevision!: number;
  @IsString() @MaxLength(39) organization!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(2048) apiUrl!: string;
  @IsBoolean() setupPullRequests!: boolean;
  @IsBoolean() managedProtection!: boolean;
}
type AuthRequest = Request & { preflytSession: AuthenticatedSession };
@Controller('configuration/github-app')
@UseGuards(SessionGuard)
export class GitHubAppManifestController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(GitHubAppManifestService) private readonly manifest: GitHubAppManifestService) {}
  private cookie() { const secure = new URL(resolveWebOrigin()).protocol === 'https:'; return { name: secure ? '__Host-preflyt.manifest' : 'preflyt.manifest', options: { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' } }; }
  @Post() @Header('Cache-Control', 'no-store') async begin(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response, @Body() body: ManifestDto) {
    this.auth.assertOrigin(req.headers.origin);
    const result = await this.manifest.begin(req.preflytSession, req.cookies?.[this.auth.sessionCookieName], body.expectedRevision, body);
    const cookie = this.cookie(); res.cookie(cookie.name, result.binding, { ...cookie.options, maxAge: result.expiresIn });
    const { binding: _binding, ...publicResult } = result; return publicResult;
  }
  @Get('status') @Header('Cache-Control', 'no-store') status(@Req() req: AuthRequest) {
    return this.manifest.status(req.preflytSession, req.cookies?.[this.auth.sessionCookieName]);
  }
  @Get('callback') @Header('Cache-Control', 'no-store') @Header('Referrer-Policy', 'no-referrer') async callback(@Req() req: AuthRequest, @Res() res: Response) {
    const cookie = this.cookie();
    try {
      await this.manifest.complete(req.preflytSession, req.cookies?.[this.auth.sessionCookieName], req.cookies?.[cookie.name] ?? '', typeof req.query.state === 'string' ? req.query.state : '', typeof req.query.code === 'string' ? req.query.code : '');
      res.clearCookie(cookie.name, cookie.options);
      return res.redirect(`${resolveWebOrigin()}/api/github/connection`);
    } catch { /* Status is retrieved separately; never echo provider errors or credentials. */ }
    res.clearCookie(cookie.name, cookie.options);
    res.redirect(`${resolveWebOrigin()}/organization-settings?tab=configuration`);
  }
}
