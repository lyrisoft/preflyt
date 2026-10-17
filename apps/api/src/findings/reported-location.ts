import { BadRequestException } from '@nestjs/common'

/** Select only locations retained in the authorized finding, never caller-supplied paths. */
export function reportedLocation<T extends { path: string | null; line: number | null; endLine?: number | null; relatedLocations?: { path: string; line: number; endLine: number }[] }>(finding: T, location?: string): T {
  if (location === undefined || location === '0') return finding
  if (!/^[1-9][0-9]{0,8}$/.test(location)) throw new BadRequestException('Choose a reported location')
  const related = finding.relatedLocations?.[Number(location) - 1]
  if (!related) throw new BadRequestException('Choose a reported location')
  return { ...finding, ...related }
}
