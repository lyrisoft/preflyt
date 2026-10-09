import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  SessionGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { GitHubRulesetService } from './github-ruleset.service.js'
@Controller('github/repositories/:repositoryId/rulesets')
@UseGuards(SessionGuard)
export class GitHubRulesetController {
  constructor(
    @Inject(GitHubRulesetService)
    private readonly rulesets: GitHubRulesetService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: Request & { preflytSession?: AuthenticatedSession },
    @Param('repositoryId') repositoryId: string,
    @Query('page') page?: string,
  ) {
    return this.rulesets.list(
      req.preflytSession!,
      repositoryId,
      page === undefined ? 1 : Number(page),
    )
  }
  @Get(':rulesetId')
  @Header('Cache-Control', 'no-store')
  detail(
    @Req() req: Request & { preflytSession?: AuthenticatedSession },
    @Param('repositoryId') repositoryId: string,
    @Param('rulesetId') id: string,
  ) {
    return this.rulesets.detail(req.preflytSession!, repositoryId, Number(id))
  }
}
