import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  UseGuards,
} from '@nestjs/common'
import { SessionGuard } from '../auth/session.guard.js'
import { PullRequestService } from './pull-request.service.js'
@Controller('github/repositories/:repositoryId/pull-requests')
@UseGuards(SessionGuard)
export class PullRequestController {
  constructor(
    @Inject(PullRequestService) private readonly prs: PullRequestService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Param('repositoryId') repo: string,
  ) {
    return this.prs.list(repo)
  }
  @Get(':number') @Header('Cache-Control', 'no-store') get(
    @Param('repositoryId') repo: string,
    @Param('number') number: string,
  ) {
    return this.prs.get(repo, number)
  }
}
