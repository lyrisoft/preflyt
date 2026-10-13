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
import { AuthorizationService } from '../auth/authorization.service.js'
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
  constructor(@Inject(GitHubService) private readonly github: GitHubService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}

  @Get('install')
  @UseGuards(SessionGuard, OwnerAdminGuard)
  async install(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const session = req.preflytSession!
    const result = await this.github.beginInstallation(session.identityId,
      session.organizationId!,
    )
    res.cookie(
      this.github.setupCookieName,
      result.browserBinding,
      cookieOptions(this.github.secureCookie, 10 * 60 * 1000),
    )
    return res.redirect(result.url)
  }

  @Get('setup/callback')
  async setupCallback(@Req() req: Request, @Res() res: Response) {
    // A fresh manifest installation has no workspace transaction. Installation alone
    // never grants access: connect it through the normal owner-verified flow.
    if (req.query.state === undefined) return res.redirect(this.github.frontendOrigin + '/apps')
    const binding = req.cookies?.[this.github.setupCookieName] as
      string
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
      string
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
  async repositories(@Req() req: AuthenticatedRequest) {
    const session = req.preflytSession!
    if (req.query.refresh === 'true')
      await this.access.requireOrganization(session, 'repository.connect')
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      'repository.read',
      false,
    )
    return this.github.listRepositories(req.query.refresh === 'true',
      scope.map((r) => r.githubId),
      session.organizationId!,
      ['OWNER', 'ADMIN'].includes(session.role),
    )
  }

  @Get('repositories/overview')
  @UseGuards(SessionGuard)
  async overview(@Req() req: AuthenticatedRequest) {
    const session = req.preflytSession!
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      'repository.read',
      false,
    )
    return this.github.repositoryOverview(scope.map((r) => r.githubId),
      session.organizationId!,
      ['OWNER', 'ADMIN'].includes(session.role),
    )
  }

  @Patch('repositories/:repositoryId/selection')
  @UseGuards(SessionGuard, OwnerAdminGuard)
  async selectRepository(
    @Param('repositoryId') repositoryId: string,
    @Body() body: RepositorySelectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const inspection = await this.github.setRepositorySelected(
      req.preflytSession!.identityId,
      repositoryId,
      body.selected,
      req.headers.origin,
    )
    return { repositoryId, selected: body.selected, ...inspection }
  }

  private clearSetupCookie(response: Response) {
    response.clearCookie(
      this.github.setupCookieName,
      cookieOptions(this.github.secureCookie, 0),
    )
  }
}
