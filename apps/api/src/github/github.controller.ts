import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { IsBoolean } from 'class-validator'
import type { Request, Response } from 'express'
import { OwnerAdminGuard, SessionGuard } from '../auth/session.guard.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { GitHubService } from './github.service.js'

class RepositorySelectionDto {
  @IsBoolean()
  selected!: boolean
}

type AuthenticatedRequest = Request & { preflytSession?: AuthenticatedSession }

const cookieOptions = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
})

@Controller('github')
export class GitHubController {
  constructor(@Inject(GitHubService) private readonly github: GitHubService) {}

  @Get('install')
  @UseGuards(SessionGuard, OwnerAdminGuard)
  async install(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const session = req.preflytSession!
    const result = await this.github.beginInstallation(session.identityId)
    res.cookie(
      this.github.setupCookieName,
      result.browserBinding,
      cookieOptions(this.github.secureCookie, 10 * 60 * 1000),
    )
    return res.redirect(result.url)
  }

  @Get('setup/callback')
  async setupCallback(@Req() req: Request, @Res() res: Response) {
    const binding = req.cookies?.[this.github.setupCookieName] as
      | string
      | undefined
    try {
      const authorizationUrl = await this.github.beginUserAuthorization(
        typeof req.query.state === 'string' ? req.query.state : '',
        binding,
        typeof req.query.installation_id === 'string'
          ? req.query.installation_id
          : '',
        typeof req.query.setup_action === 'string'
          ? req.query.setup_action
          : undefined,
      )
      return res.redirect(authorizationUrl)
    } catch {
      this.clearSetupCookie(res)
      return res.redirect(this.github.frontendOrigin + '/apps?github=error')
    }
  }

  @Get('oauth/callback')
  async oauthCallback(@Req() req: Request, @Res() res: Response) {
    const binding = req.cookies?.[this.github.setupCookieName] as
      | string
      | undefined
    try {
      const result = await this.github.completeUserAuthorization(
        typeof req.query.state === 'string' ? req.query.state : '',
        binding,
        typeof req.query.code === 'string' ? req.query.code : '',
      )
      this.clearSetupCookie(res)
      const redirect = new URL('/apps', this.github.frontendOrigin)
      redirect.searchParams.set('github', 'connected')
      redirect.searchParams.set('account', result.accountLogin)
      return res.redirect(redirect.href)
    } catch {
      this.clearSetupCookie(res)
      return res.redirect(this.github.frontendOrigin + '/apps?github=error')
    }
  }

  @Get('repositories')
  @UseGuards(SessionGuard)
  repositories(@Req() req: Request) {
    return this.github.listRepositories(req.query.refresh === 'true')
  }

  @Get('repositories/overview')
  @UseGuards(SessionGuard)
  overview() {
    return this.github.repositoryOverview()
  }

  @Patch('repositories/:repositoryId/selection')
  @UseGuards(SessionGuard, OwnerAdminGuard)
  async selectRepository(
    @Param('repositoryId') repositoryId: string,
    @Body() body: RepositorySelectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.github.setRepositorySelected(
      req.preflytSession!.identityId,
      repositoryId,
      body.selected,
      req.headers.origin,
    )
    return { repositoryId, selected: body.selected }
  }

  private clearSetupCookie(response: Response) {
    response.clearCookie(
      this.github.setupCookieName,
      cookieOptions(this.github.secureCookie, 0),
    )
  }
}
