import { importCiEvidence } from './ci-evidence.js'
import { PrismaService } from '../prisma/prisma.service.js'

/** Replay-safe append-only event processing; never advances a current PR revision or evaluates a gate. */
export class GitHubEventProcessor {
  constructor(private readonly prisma: PrismaService) {}

  async process(id: string) {
    await this.prisma.$transaction(async tx => {
      const delivery = await tx.gitHubWebhookDelivery.findUnique({ where: { id } })
      if (!delivery || delivery.state !== 'RECEIVED') return
      // Compare-and-set claims the delivery inside the transaction and serializes duplicate jobs.
      const claimed = await tx.gitHubWebhookDelivery.updateMany({
        where: { id, state: 'RECEIVED' }, data: { state: 'PROCESSED', processedAt: new Date() },
      })
      if (claimed.count !== 1) return
      const installation = await tx.gitHubInstallation.updateMany({
        where: { id: delivery.installationId, active: true }, data: { active: true },
      })
      const repository = installation.count === 1 ? await tx.gitHubRepository.updateMany({
        where: { githubId: delivery.repositoryGithubId, installationId: delivery.installationId, selected: true },
        data: { selected: true },
      }) : { count: 0 }
      if (repository.count !== 1) {
        await tx.gitHubWebhookDelivery.update({ where: { id }, data: { state: 'IGNORED', reason: 'repository_access_changed' } })
        return
      }
      const evidence = importCiEvidence(delivery)
      if (evidence) await tx.importedCiEvidence.create({ data: evidence })
      await tx.auditEvent.create({ data: {
        event: 'github_event_processed', actorId: null,
        metadata: { deliveryId: id, event: delivery.event, action: delivery.action, repositoryId: delivery.repositoryGithubId.toString(), sourceSha: delivery.sourceSha },
      } })
    })
  }
}
