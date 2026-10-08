import type {
  Prisma,
  GitHubWebhookDelivery,
} from '../generated/prisma/client.js'
import { readPullRequestContext } from '../github-events/pull-request-context.js'
import { digest } from './assessment-plan.js'
/** Called while the processor holds installation/repository locks; arrival order is not revision order. */
export async function observePullRequest(
  tx: Prisma.TransactionClient,
  delivery: GitHubWebhookDelivery,
) {
  if (delivery.event !== 'pull_request' || !delivery.sourceNumber) return
  const repo = await tx.gitHubRepository.findUnique({
    where: { githubId: delivery.repositoryGithubId },
  })
  if (!repo) return
  const previous = await tx.repositoryPullRequest.findUnique({
    where: {
      repositoryId_number: {
        repositoryId: repo.id,
        number: delivery.sourceNumber,
      },
    },
  })
  const context = readPullRequestContext(delivery.pullRequestContext)
  if (
    !context ||
    context.head.sha !== delivery.sourceSha ||
    context.base.repositoryId !== delivery.repositoryGithubId.toString()
  ) {
    if (previous)
      await tx.repositoryPullRequest.update({
        where: { id: previous.id },
        data: {
          revision: { increment: 1 },
          syncState: 'PENDING',
          verifiedAt: null,
          lastSyncAttemptAt: null,
        },
      })
    return
  }
  const time = delivery.sourceUpdatedAt
  if (
    previous &&
    time &&
    previous.sourceUpdatedAt &&
    time < previous.sourceUpdatedAt
  )
    return
  const equal =
    previous &&
    digest(previous.context) === digest(context) &&
    previous.objectId === delivery.sourceObjectId
  if (
    previous &&
    time &&
    previous.sourceUpdatedAt &&
    time.getTime() === previous.sourceUpdatedAt.getTime() &&
    equal
  )
    return
  const conflict =
    !!previous &&
    (!time ||
      !previous.sourceUpdatedAt ||
      previous.objectId !== delivery.sourceObjectId ||
      time.getTime() === previous.sourceUpdatedAt.getTime())
  const data = {
    objectId: delivery.sourceObjectId,
    context,
    sourceUpdatedAt: time,
    syncState: conflict ? 'CONFLICTED' : 'PENDING',
    verifiedAt: null,
    lastSyncAttemptAt: null,
  }
  if (previous)
    await tx.repositoryPullRequest.update({
      where: { id: previous.id },
      data: { ...data, revision: { increment: 1 } },
    })
  else
    await tx.repositoryPullRequest.create({
      data: { ...data, repositoryId: repo.id, number: delivery.sourceNumber },
    })
}
