import { Body, Controller, Header, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { IsIn, IsString, Matches, MaxLength } from 'class-validator'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import { OwnerAdminGuard, SessionGuard, type AuthenticatedSession } from '../auth/session.guard.js'
import { CiArtifactService } from './ci-artifact.service.js'

class ArtifactDto {
  @IsIn(['junit', 'sarif', 'lcov']) format!: 'junit' | 'sarif' | 'lcov'
  @IsString() @MaxLength(262144) content!: string
  @IsString() @Matches(/^[a-f0-9]{64}$/i) sha256!: string
}
@Controller('github')
export class CiArtifactController {
  constructor(@Inject(CiArtifactService) private readonly artifacts: CiArtifactService,
    @Inject(AuthService) private readonly auth: AuthService) {}

  @Post('repositories/:repositoryId/ci-evidence/:deliveryId/artifacts')
  @UseGuards(SessionGuard, OwnerAdminGuard)
  @Header('Cache-Control', 'no-store')
  import(@Param('repositoryId') repositoryId: string, @Param('deliveryId') deliveryId: string,
    @Body() body: ArtifactDto, @Req() request: Request & { preflytSession: AuthenticatedSession }) {
    this.auth.assertOrigin(request.headers.origin)
    return this.artifacts.import(repositoryId, deliveryId, body, request.preflytSession.identityId)
  }
}
