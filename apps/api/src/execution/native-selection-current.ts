import { digest } from '../assessments/assessment-digest.js'
import type { Prisma, NativeExecutionRequest } from '../generated/prisma/client.js'
import type { PrismaService } from '../prisma/prisma.service.js'
import { currentStandards } from '../standards/policy-standards.js'
/** Health plans have no policy selection and can never satisfy a policy's native evidence lookup. */
export async function nativeSelectionCurrent(db: PrismaService | Prisma.TransactionClient, row: NativeExecutionRequest) {
 if (!row.healthAssessmentId) return (await currentStandards(db, row.repositoryId, { expectedId: row.selectionId }))?.id === row.selectionId
 const health = await db.repositoryHealthAssessment.findFirst({ where: {
  id: row.healthAssessmentId, nativeRequestId: row.id, repositoryId: row.repositoryId, organizationId: row.organizationId,
  sourceSha: row.sourceSha, actorId: row.actorId, state: 'RUNNING', cancelledAt: null,
 } })
 return !!health && !!health.plan && digest(health.plan) === row.planHash && row.selectionId === 'health:' + health.id
}
