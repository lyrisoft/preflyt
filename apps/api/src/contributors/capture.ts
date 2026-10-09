import { ConflictException } from '@nestjs/common'
import type { PrismaService } from '../prisma/prisma.service.js'
import type { ContributorActivity } from '../github-events/contributor-event.js'
export async function captureContributors(
  db: PrismaService,
  deliveryId: string,
  payloadHash: string,
  installationId: bigint,
  repositoryGithubId: bigint,
  activities: ContributorActivity[],
) {
  return db.$transaction(async (tx) => {
    // Lock the installed repository, so deselection/revocation and concurrent replay cannot race ingestion.
    const updated = await tx.gitHubRepository.updateMany({
      where: {
        githubId: repositoryGithubId,
        installationId,
        available: true,
        selected: true,
        installation: { active: true },
      },
      data: { selected: true },
    })
    if (!updated.count)
      return { accepted: false, reason: 'repository_not_selected' }
    const repository = await tx.gitHubRepository.findUniqueOrThrow({
      where: { githubId: repositoryGithubId },
    })
    const old = await tx.contributorDelivery.findUnique({
      where: { id: deliveryId },
    })
    if (old) {
      if (old.payloadHash !== payloadHash)
        throw new ConflictException(
          'Contributor delivery identifier was reused',
        )
      return { accepted: true, duplicate: true, deliveryId }
    }
    const observedAt = activities.length
      ? new Date(Math.max(...activities.map((a) => a.observedAt.getTime())))
      : new Date()
    await tx.contributorDelivery.create({
      data: {
        id: deliveryId,
        payloadHash,
        repositoryId: repository.id,
        observedAt,
      },
    })
    for (const a of activities) {
      const existing = await tx.contributor.findUnique({
        where: {
          installationId_githubUserId: {
            installationId,
            githubUserId: a.actor.githubUserId,
          },
        },
      })
      const contributor = await tx.contributor.upsert({
        where: {
          installationId_githubUserId: {
            installationId,
            githubUserId: a.actor.githubUserId,
          },
        },
        create: { installationId, ...a.actor, lastObservedAt: a.observedAt },
        update:
          !existing || existing.lastObservedAt <= a.observedAt
            ? {
                login: a.actor.login,
                kind: a.actor.kind,
                lastObservedAt: a.observedAt,
              }
            : {},
      })
      const { actor, ...observation } = a
      await tx.contributorObservation.createMany({
        data: [
          {
            ...observation,
            deliveryId,
            repositoryId: repository.id,
            contributorId: contributor.id,
          },
        ],
        skipDuplicates: true,
      })
    }
    return { accepted: true, duplicate: false, deliveryId }
  })
}
