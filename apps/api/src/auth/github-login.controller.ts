import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common'
import { IsString, Matches } from 'class-validator'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import { GitHubLoginService } from './github-login.service.js'
class EnterOrganizationDto {
  @IsString() @Matches(/^[1-9]\d{0,15}$/) installationId!: string
}
const options = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})
@Controller('auth/github')
export class GitHubLoginController {
  constructor(
    @Inject(GitHubLoginService) private readonly login: GitHubLoginService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('login') @Header('Cache-Control', 'no-store') async begin(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.login.begin(
      req.ip ?? 'unknown',
      typeof req.query.redirect === 'string' ? req.query.redirect : undefined,
      req.query.link === 'workspace'
        ? (req.cookies?.[this.auth.sessionCookieName] ?? '')
        : undefined,
    )
    res.cookie(
      this.login.transactionCookie,
      result.browserBinding,
      options(this.auth.secureCookie, 300000),
    )
    return res.redirect(result.url)
  }
  @Get('callback') @Header('Cache-Control', 'no-store') async callback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const binding = req.cookies?.[this.login.transactionCookie] as
      string | undefined
    res.clearCookie(
      this.login.transactionCookie,
      options(this.auth.secureCookie, 0),
    )
    try {
      const result = await this.login.complete(
        typeof req.query.state === 'string' ? req.query.state : '',
        binding,
        typeof req.query.code === 'string' ? req.query.code : '',
      )
      res.cookie(
        this.login.onboardingCookie,
        result.challengeToken,
        options(this.auth.secureCookie, 600000),
      )
      return res.redirect(
        new URL('/github-onboarding', this.auth.frontendOrigin).href,
      )
    } catch {
      res.clearCookie(
        this.login.onboardingCookie,
        options(this.auth.secureCookie, 0),
      )
      return res.redirect(
        new URL('/sign-in?error=github', this.auth.frontendOrigin).href,
      )
    }
  }
  @Get('organizations') @Header('Cache-Control', 'no-store') organizations(
    @Req() req: Request,
  ) {
    return this.login.organizations(req.cookies?.[this.login.onboardingCookie])
  }
  @Post('organizations') @Header('Cache-Control', 'no-store') async enter(
    @Body() body: EnterOrganizationDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.login.enter(
      req.cookies?.[this.login.onboardingCookie],
      body.installationId,
      req.headers.origin,
      req.cookies?.[this.auth.sessionCookieName],
    )
    res.clearCookie(
      this.login.onboardingCookie,
      options(this.auth.secureCookie, 0),
    )
    res.cookie(
      this.auth.sessionCookieName,
      result.sessionToken,
      options(
        this.auth.secureCookie,
        Math.max(0, result.expiresAt.getTime() - Date.now()),
      ),
    )
    return res.json({ authenticated: true, returnPath: result.returnPath })
  }
}
