import { BadRequestException } from '@nestjs/common'
import { digest } from '../assessments/assessment-digest.js'

// Deliberately excludes commit/assessment IDs, but never broadens to a whole rule or file.
export function findingIgnoreId(organizationId: string, row: any) {
  return digest(['finding-ignore-v1', organizationId, row.repositoryId, row.origin ?? 'ci',
    row.category, row.ruleId, row.path, row.line, row.endLine ?? row.line, row.title])
}
export function ignoreState(saved: any, now = new Date()) {
  return { state: saved?.state === 'IGNORED' && (!saved.expiresAt || new Date(saved.expiresAt) > now) ? 'IGNORED' : 'OPEN',
    reason: saved?.reason ?? '', expiresAt: saved?.expiresAt ?? null, revision: saved?.revision ?? 0,
    updatedAt: saved?.updatedAt ?? null, expired: saved?.state === 'IGNORED' && !!saved.expiresAt && new Date(saved.expiresAt) <= now }
}
export function validateIgnore(input: any, now = new Date()) {
  if (!input || !['IGNORED', 'OPEN'].includes(input.state) || typeof input.reason !== 'string' ||
    !input.reason.trim() || input.reason.trim().length > 1000 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)
    throw new BadRequestException('Choose Ignore or Reopen and provide a reason (up to 1,000 characters).')
  if (input.expiresAt != null && typeof input.expiresAt !== 'string') throw new BadRequestException('Choose a valid expiry date.')
  const expiresAt = input.expiresAt == null || input.expiresAt === '' ? null : new Date(input.expiresAt)
  if (expiresAt && (typeof input.expiresAt !== 'string' || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now || input.state !== 'IGNORED'))
    throw new BadRequestException('Choose a future expiry for the ignore decision.')
  return { state: input.state as string, reason: input.reason.trim(), expiresAt }
}
