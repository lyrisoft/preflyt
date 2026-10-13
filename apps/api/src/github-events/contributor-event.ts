import { BadRequestException } from '@nestjs/common'
export type ContributorActivity = {
  actor: {
    githubUserId: string
    login: string
    kind: 'BOT' | 'HUMAN' | 'UNKNOWN'
  }
  relationship: string
  sourceObjectId: string
  sourceSha: string
  pullRequestNumber: number | null
  action: string
  state: string | null
  merged: boolean
  observedAt: Date
}
const user = (v: any): ContributorActivity['actor'] | null => {
  if (v == null) return null
  if (
    !Number.isSafeInteger(v.id) ||
    v.id < 1 ||
    typeof v.login !== 'string' ||
    !/^[a-zA-Z0-9_-]+(?:\[bot\])?$/.test(v.login) ||
    v.login.length > 100
  )
    throw new BadRequestException('Invalid contributor identity')
  return {
    githubUserId: String(v.id),
    login: v.login,
    kind: v.type === 'Bot' ? 'BOT' : v.type === 'User' ? 'HUMAN' : 'UNKNOWN',
  }
}
const date = (v: unknown) => {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v)))
    throw new BadRequestException('Contributor activity timestamp required')
  return new Date(v)
}
export function normalizeContributorEvent(
  event: string,
  body: any,
): {
  installationId: bigint
  repositoryGithubId: bigint
  activities: ContributorActivity[]
} | null {
  if (!['pull_request', 'pull_request_review', 'push'].includes(event))
    return null
  if (
    !body ||
    !Number.isSafeInteger(body.installation?.id) ||
    body.installation.id < 1 ||
    !Number.isSafeInteger(body.repository?.id) ||
    body.repository.id < 1
  )
    throw new BadRequestException('Contributor event scope invalid')
  const activities: ContributorActivity[] = []
  const add = (
    actor: any,
    relationship: string,
    sourceObjectId: string,
    sha: string,
    number: number | null,
    action: string,
    state: string | null,
    merged: boolean,
    time: unknown,
  ) => {
    const identity = user(actor)
    if (!identity) return
    if (
      !/^[a-f0-9]{40}$/i.test(sha) ||
      (!/^\d+$/.test(sourceObjectId) &&
        !/^[a-f0-9]{40}$/i.test(sourceObjectId)) ||
      (number !== null &&
        (!Number.isSafeInteger(number) || number < 1 || number > 2147483647))
    )
      throw new BadRequestException('Contributor source invalid')
    activities.push({
      actor: identity,
      relationship,
      sourceObjectId,
      sourceSha: sha.toLowerCase(),
      pullRequestNumber: number,
      action,
      state,
      merged,
      observedAt: date(time),
    })
  }
  if (event === 'pull_request') {
    if (
      ![
        'opened',
        'reopened',
        'synchronize',
        'edited',
        'closed',
        'ready_for_review',
      ].includes(body.action)
    )
      return null
    const p = body.pull_request
    if (!p || p.base?.repo?.id !== body.repository.id)
      throw new BadRequestException('Contributor PR scope invalid')
    add(
      p.user,
      'PR_AUTHOR',
      String(p.id),
      p.head?.sha,
      p.number,
      body.action,
      p.state,
      !!p.merged,
      p.updated_at,
    )
    if (p.merged && p.merged_by)
      add(
        p.merged_by,
        'MERGE_ACTOR',
        String(p.id),
        p.head?.sha,
        p.number,
        body.action,
        p.state,
        true,
        p.merged_at ?? p.updated_at,
      )
  } else if (event === 'pull_request_review') {
    if (!['submitted', 'edited', 'dismissed'].includes(body.action)) return null
    const p = body.pull_request,
      r = body.review
    if (!p || !r || p.base?.repo?.id !== body.repository.id)
      throw new BadRequestException('Contributor review scope invalid')
    add(
      r.user,
      'REVIEWER',
      String(r.id),
      r.commit_id,
      p.number,
      body.action,
      r.state,
      false,
      r.submitted_at ?? p.updated_at,
    )
  } else {
    if (body.deleted) return null
    if (!Array.isArray(body.commits) || body.commits.length > 2048)
      throw new BadRequestException('Push commit list invalid')
    // Push author names/emails/usernames lack stable GitHub IDs. Never guess identity matches.
    // Persist only identities explicitly containing a numeric provider ID; mark ordinary pushes as unattributed in the receipt.
    for (const c of body.commits) {
      if (c.author?.id)
        add(
          c.author,
          'COMMIT_AUTHOR',
          c.id,
          c.id,
          null,
          'pushed',
          null,
          false,
          c.timestamp,
        )
      if (c.committer?.id)
        add(
          c.committer,
          'COMMITTER',
          c.id,
          c.id,
          null,
          'pushed',
          null,
          false,
          c.timestamp,
        )
    }
  }
  return {
    installationId: BigInt(body.installation.id),
    repositoryGithubId: BigInt(body.repository.id),
    activities,
  }
}
