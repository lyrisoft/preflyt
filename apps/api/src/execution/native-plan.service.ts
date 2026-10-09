import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  posture,
  type PackRef,
  type AdoptionProfile,
} from '../standards/catalogue.js'
import { buildNativePlan } from './native-plan.js'
@Injectable()
export class NativePlanService {
  constructor(
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  async get(session: AuthenticatedSession, repositoryId: string) {
    const repo = await this.access.requireRepository(
      session,
      repositoryId,
      'assessment.read',
    )
    const [profile, selection] = await Promise.all([
      this.prisma.repositoryProfile.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
    ])
    if (!profile || !selection)
      throw new ConflictException(
        'Inspect this repository and save its standards before planning checks.',
      )
    const plan = buildNativePlan({
      organizationId: session.organizationId!,
      repositoryId,
      sourceSha: profile.sourceSha,
      selectionId: selection.id,
      rules: posture(
        selection.packs as unknown as PackRef[],
        selection.profile as AdoptionProfile,
        [],
      ),
    })
    await this.access.requireRepository(
      session,
      repositoryId,
      'assessment.read',
    )
    // A plan is tied to the displayed recorded commit; it never claims current branch HEAD or a check outcome.
    return {
      ...plan,
      recordedAt: profile.createdAt.toISOString(),
      branch: profile.branch,
    }
  }
}
