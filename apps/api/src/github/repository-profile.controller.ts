import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  SessionGuard,
  OwnerAdminGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { RepositoryProfileService } from './repository-profile.service.js'

@Controller('github/repositories/:repositoryId/profile')
@UseGuards(SessionGuard)
export class RepositoryProfileController {
  constructor(
    @Inject(RepositoryProfileService)
    private readonly profiles: RepositoryProfileService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Param('repositoryId') repositoryId: string) {
    return this.profiles.get(repositoryId)
  }

  @Get('branches')
  @Header('Cache-Control', 'no-store')
  branches(
    @Param('repositoryId') repositoryId: string,
    @Query('page') page?: string,
  ) {
    return this.profiles.branches(
      repositoryId,
      page === undefined ? 1 : Number(page),
    )
  }

  @Post()
  @UseGuards(OwnerAdminGuard)
  @Header('Cache-Control', 'no-store')
  discover(
    @Param('repositoryId') repositoryId: string,
    @Body() body: { branch?: string } | undefined,
    @Req() request: Request & { preflytSession?: AuthenticatedSession },
  ) {
    return this.profiles.discover(
      repositoryId,
      request.preflytSession!.identityId,
      request.headers.origin,
      body?.branch,
    )
  }
}
