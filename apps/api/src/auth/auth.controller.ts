import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service.js'

class BootstrapDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string
}

const cookieOptions = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const result = await this.auth.beginLogin(req.ip ?? 'unknown')
    res.cookie(
      this.auth.transactionCookieName,
      result.browserBinding,
      cookieOptions(this.auth.secureCookie, 5 * 60 * 1000),
    )
    return res.redirect(result.url)
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const binding = req.cookies?.[this.auth.transactionCookieName] as
      | string
      | undefined
    res.clearCookie(
      this.auth.transactionCookieName,
      cookieOptions(this.auth.secureCookie, 0),
    )
    try {
      const result = await this.auth.completeLogin(req, binding)
      if (result.kind === 'bootstrap') {
        res.cookie(
          this.auth.challengeCookieName,
          result.challengeToken,
          cookieOptions(this.auth.secureCookie, 5 * 60 * 1000),
        )
        return res.redirect(new URL('/setup', this.auth.frontendOrigin).href)
      }
      res.cookie(
        this.auth.sessionCookieName,
        result.sessionToken,
        cookieOptions(this.auth.secureCookie, 8 * 60 * 60 * 1000),
      )
      return res.redirect(new URL('/', this.auth.frontendOrigin).href)
    } catch {
      return res.redirect(
        new URL('/sign-in?error=oidc', this.auth.frontendOrigin).href,
      )
    }
  }

  @Post('bootstrap')
  async bootstrap(
    @Body() body: BootstrapDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const challenge = req.cookies?.[this.auth.challengeCookieName] as
      | string
      | undefined
    if (!challenge) throw new UnauthorizedException('Bootstrap session expired')
    const result = await this.auth.bootstrapOwner(
      body.token,
      challenge,
      req.headers.origin,
      req.ip ?? 'unknown',
    )
    res.clearCookie(
      this.auth.challengeCookieName,
      cookieOptions(this.auth.secureCookie, 0),
    )
    res.cookie(
      this.auth.sessionCookieName,
      result.sessionToken,
      cookieOptions(this.auth.secureCookie, 8 * 60 * 60 * 1000),
    )
    return res.status(201).json({ authenticated: true, role: 'OWNER' })
  }

  @Get('session')
  session(@Req() req: Request) {
    return this.auth.currentSession(
      req.cookies?.[this.auth.sessionCookieName] as string | undefined,
    )
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.auth.logout(
      req.cookies?.[this.auth.sessionCookieName] as string | undefined,
      req.headers.origin,
    )
    res.clearCookie(
      this.auth.sessionCookieName,
      cookieOptions(this.auth.secureCookie, 0),
    )
    return res.status(204).send()
  }
}
