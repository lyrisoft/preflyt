import { Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req, UseGuards, type RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { SessionGuard } from '../auth/session.guard.js'
import { GitHubWebhookService } from './github-webhook.service.js'

@Controller('github')
export class GitHubWebhookController {
  constructor(@Inject(GitHubWebhookService) private readonly webhooks: GitHubWebhookService) {}

  @Post('webhooks')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  receive(@Req() request: RawBodyRequest<Request>) {
    return this.webhooks.receive(request.rawBody, request.get('X-Hub-Signature-256'),
      request.get('X-GitHub-Delivery'), request.get('X-GitHub-Event'), request.body)
  }

  @Get('repositories/:repositoryId/ci-evidence')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  evidence(@Param('repositoryId') repositoryId: string, @Query('sha') sha?: string) {
    return this.webhooks.evidence(repositoryId, sha)
  }

  @Get('repositories/:repositoryId/events')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  list(@Param('repositoryId') repositoryId: string) {
    return this.webhooks.list(repositoryId)
  }
}
