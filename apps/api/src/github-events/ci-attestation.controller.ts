import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { IsString, Matches, MaxLength } from 'class-validator'
import type { Request } from 'express'
import { AuthService } from '../auth/auth.service.js'
import {
  SessionGuard,
  OwnerAdminGuard,
  type AuthenticatedSession,
} from '../auth/session.guard.js'
import { CiAttestationService } from './ci-attestation.service.js'
class ProofDto {
  @IsString() @MaxLength(524288) bundle!: string
  @IsString()
  @MaxLength(256)
  @Matches(
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/,
  )
  signerWorkflow!: string
}
@Controller(
  'github/repositories/:repositoryId/ci-evidence/:deliveryId/artifacts/:artifactId/provenance',
)
@UseGuards(SessionGuard)
export class CiAttestationController {
  constructor(
    @Inject(CiAttestationService)
    private readonly service: CiAttestationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  get(
    @Param('repositoryId') repo: string,
    @Param('deliveryId') delivery: string,
    @Param('artifactId') artifact: string,
  ) {
    return this.service.get(repo, delivery, artifact)
  }
  @Post()
  @UseGuards(OwnerAdminGuard)
  @Header('Cache-Control', 'no-store')
  verify(
    @Param('repositoryId') repo: string,
    @Param('deliveryId') delivery: string,
    @Param('artifactId') artifact: string,
    @Body() body: ProofDto,
    @Req() request: Request & { preflytSession: AuthenticatedSession },
  ) {
    this.auth.assertOrigin(request.headers.origin)
    return this.service.verify(
      repo,
      delivery,
      artifact,
      body,
      request.preflytSession.identityId,
    )
  }
}
