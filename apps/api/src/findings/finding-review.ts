import { BadRequestException } from '@nestjs/common';
import { digest } from '../assessments/assessment-digest.js';

export const findingClassifications = ['POTENTIAL', 'LIKELY', 'CONFIRMED', 'FALSE_POSITIVE'] as const;
export type FindingClassification = typeof findingClassifications[number];
// Human conclusions belong to this exact saved assessment and commit. They are
// deliberately separate from cross-scan ignores and workflow assignments.
export function findingReviewId(organizationId: string, row: {id?: string; fingerprint?: string; healthFingerprint?: string; repositoryId: string; assessmentId: string; sourceSha: string; origin?: string}) {
  return digest({ organizationId, repository: row.repositoryId, assessment: row.assessmentId, sourceSha: row.sourceSha, origin: row.origin ?? 'ci', finding: row.origin === 'health' ? row.healthFingerprint ?? row.fingerprint ?? row.id : row.id ?? row.fingerprint });
}
export function validateFindingReview(input: unknown) {
  const value = input as Record<string, unknown> | null;
  if (!value || !findingClassifications.includes(value.classification as FindingClassification) ||
      typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 4000 ||
      !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0)
    throw new BadRequestException('Choose a classification and explain the evidence (up to 4,000 characters). Refresh if the decision has changed.');
  return { classification: value.classification as FindingClassification, reason: value.reason.trim(), expectedRevision: value.expectedRevision as number };
}
