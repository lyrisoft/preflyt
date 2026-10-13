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
import { IsString, Matches, IsOptional, IsBoolean } from 'class-validator'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import { GitHubLoginService } from './github-login.service.js'
class ConfirmIdentityDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) previewHash!: string
}
class EnterOrganizationDto {
  @IsOptional() @IsBoolean() recoverOwner?: boolean
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
      req.query.link === 'identity' ? (req.cookies?.[this.auth.sessionCookieName] ?? '') : undefined,
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
    let linkingIdentity = false
    let linking = !!req.cookies?.[this.auth.sessionCookieName]
    try {
      linkingIdentity = await this.login.isIdentityLinkCallback(typeof req.query.state === 'string' ? req.query.state : '', binding)
      linking =
        (await this.login.isWorkspaceLinkCallback(
          typeof req.query.state === 'string' ? req.query.state : '',
          binding,
        )) || linking
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
        new URL(
          result.linkingIdentity ? '/organization-settings?identityLink=confirm' : result.linkingWorkspace
            ? '/access-control?tab=github&githubLink=confirm'
            : '/github-onboarding',
          this.auth.frontendOrigin,
        ).href,
      )
    } catch {
      res.clearCookie(
        this.login.onboardingCookie,
        options(this.auth.secureCookie, 0),
      )
      return res.redirect(
        new URL(
          linkingIdentity ? '/organization-settings?identityLink=failed' : linking
            ? '/access-control?tab=github&githubLink=failed'
            : '/sign-in?error=github',
          this.auth.frontendOrigin,
        ).href,
      )
    }
  }
  @Get('identity/status') @Header('Cache-Control', 'no-store') identityStatus(@Req() req: Request) {
    return this.login.identityLinkStatus(req.cookies?.[this.auth.sessionCookieName])
  }
  @Get('identity/preview') @Header('Cache-Control', 'no-store') identityPreview(@Req() req: Request) {
    return this.login.identityLinkDetails(req.cookies?.[this.login.onboardingCookie], req.cookies?.[this.auth.sessionCookieName])
  }
  @Post('identity/confirm') @Header('Cache-Control', 'no-store') async identityConfirm(@Body() body: ConfirmIdentityDto, @Req() req: Request, @Res() res: Response) {
    const result = await this.login.confirmIdentityLink(req.cookies?.[this.login.onboardingCookie], req.cookies?.[this.auth.sessionCookieName], body.previewHash, req.headers.origin)
    res.clearCookie(this.login.onboardingCookie, options(this.auth.secureCookie, 0))
    return res.json(result)
  }
  @Post('identity/cancel') @Header('Cache-Control', 'no-store') async identityCancel(@Req() req: Request, @Res() res: Response) {
    this.auth.assertOrigin(req.headers.origin)
    await this.login.cancelIdentityLink(req.cookies?.[this.login.onboardingCookie], req.cookies?.[this.auth.sessionCookieName])
    res.clearCookie(this.login.onboardingCookie, options(this.auth.secureCookie, 0))
    return res.json({ cancelled: true })
  }
  @Get('organizations') @Header('Cache-Control', 'no-store') organizations(
    @Req() req: Request,
  ) {
    return this.login.organizations(
      req.cookies?.[this.login.onboardingCookie],
      req.cookies?.[this.auth.sessionCookieName],
    )
  }
  @Post('link/cancel') @Header('Cache-Control', 'no-store') async cancelLink(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.auth.assertOrigin(req.headers.origin)
    await this.login.cancelWorkspaceLink(
      req.cookies?.[this.login.onboardingCookie],
      req.cookies?.[this.auth.sessionCookieName],
    )
    res.clearCookie(
      this.login.onboardingCookie,
      options(this.auth.secureCookie, 0),
    )
    return res.json({ cancelled: true })
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
      body.recoverOwner ?? false,
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
