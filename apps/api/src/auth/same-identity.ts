import type { Prisma } from '../generated/prisma/client.js'

/** Proof-linked historical actors are the same person, never independent approvers. */
export async function sameIdentity(db: Pick<Prisma.TransactionClient, 'identityLoginLink'>, a: string, b: string) {
  if (a === b) return true
  return !!await db.identityLoginLink.findFirst({
    where: { OR: [
      { sourceIdentityId: a, targetIdentityId: b },
      { sourceIdentityId: b, targetIdentityId: a },
    ] }, select: { id: true },
  })
}
