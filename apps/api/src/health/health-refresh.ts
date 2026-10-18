import { validProfileBranch } from '../github/repository-profile.js'

/** Called only inside the signed webhook transaction for a selected, connected repository. */
export async function requestHealthRefresh(
  tx: any,
  repo: { id: string; defaultBranch: string | null },
  ref: unknown,
  sha: unknown,
) {
  if (
    ref !== `refs/heads/${repo.defaultBranch}` ||
    !repo.defaultBranch ||
    !validProfileBranch(repo.defaultBranch) ||
    typeof sha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(sha) ||
    /^0+$/.test(sha)
  )
    return
  await tx.repositoryHealthTarget.updateMany({
    where: { repositoryId: repo.id, branch: repo.defaultBranch },
    data: { headSha: null, headCheckedAt: null },
  })
  const nextAttemptAt = new Date(Date.now() + 30000)
  await tx.repositoryHealthRefresh.upsert({
    where: {
      repositoryId_branch: {
        repositoryId: repo.id,
        branch: repo.defaultBranch,
      },
    },
    create: {
      repositoryId: repo.id,
      branch: repo.defaultBranch,
      sourceSha: sha.toLowerCase(),
      nextAttemptAt,
    },
    update: {
      sourceSha: sha.toLowerCase(),
      revision: { increment: 1 },
      requestedAt: new Date(),
      nextAttemptAt,
    },
  })
}
