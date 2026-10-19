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
  Optional,
  Header,
} from '@nestjs/common'
import { IsBoolean } from 'class-validator'
import type { Request, Response } from 'express'
import { OwnerAdminGuard, SessionGuard } from '../auth/session.guard.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import { GitHubService } from './github.service.js'
import { GitHubConnectionService } from './github-connection.service.js'

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
    @Optional() @Inject(GitHubConnectionService) private readonly connection?: GitHubConnectionService,
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
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async setupCallback(@Req() req: Request, @Res() res: Response) {
    if (typeof req.query.state === 'string' && req.query.state.startsWith('connection_')) {
      try {
        if (!this.connection) throw new Error('Connection service unavailable')
        const url = await this.connection.installed(req.query.state, req.cookies?.[this.connection.cookieName], req.cookies?.[this.connection.sessionCookieName], typeof req.query.installation_id === 'string' ? req.query.installation_id : '', typeof req.query.setup_action === 'string' ? req.query.setup_action : '')
        return res.redirect(url)
      } catch {
        this.clearConnectionCookie(res)
        return res.redirect(this.github.frontendOrigin + '/repositories?github=error')
      }
    }
    // A fresh manifest installation has no workspace transaction. Installation alone
    // never grants access: connect it through the normal owner-verified flow.
    if (req.query.state === undefined) return res.redirect(this.github.frontendOrigin + '/repositories')
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
      return res.redirect(this.github.frontendOrigin + '/repositories?github=error')
    }
  }

  @Get('oauth/callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async oauthCallback(@Req() req: Request, @Res() res: Response) {
    if (typeof req.query.state === 'string' && req.query.state.startsWith('connection_')) {
      try {
        if (!this.connection) throw new Error('Connection service unavailable')
        const result = await this.connection.complete(req.query.state, req.cookies?.[this.connection.cookieName], req.cookies?.[this.connection.sessionCookieName], typeof req.query.code === 'string' ? req.query.code : '')
        this.clearConnectionCookie(res)
        const url = new URL('/repositories', this.github.frontendOrigin)
        url.searchParams.set('github', 'connected')
        url.searchParams.set('account', result.accountLogin)
        return res.redirect(url.href)
      } catch {
        this.clearConnectionCookie(res)
        return res.redirect(this.github.frontendOrigin + '/repositories?github=error')
      }
    }
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
      const redirect = new URL('/repositories', this.github.frontendOrigin)
      redirect.searchParams.set('github', 'connected')
      redirect.searchParams.set('account', result.accountLogin)
      return res.redirect(redirect.href)
    } catch {
      this.clearSetupCookie(res)
      return res.redirect(this.github.frontendOrigin + '/repositories?github=error')
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
      session.role === 'ENGINEERING_LEAD' ? 'repository.manage' : 'repository.read',
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
      session.role === 'ENGINEERING_LEAD' ? 'repository.manage' : 'repository.read',
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
      req.preflytSession!.organizationId!,
    )
    return { repositoryId, selected: body.selected, ...inspection }
  }

  private clearSetupCookie(response: Response) {
    response.clearCookie(
      this.github.setupCookieName,
      cookieOptions(this.github.secureCookie, 0),
    )
  }

  private clearConnectionCookie(response: Response) {
    if (this.connection) response.clearCookie(this.connection.cookieName, cookieOptions(this.connection.secureCookie, 0))
  }
}
