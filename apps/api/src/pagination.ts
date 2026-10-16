import { BadRequestException } from '@nestjs/common'

export function readPageSize(value: unknown = 10): number {
  const size = Number(value)
  if (![10, 25, 50, 100].includes(size)) throw new BadRequestException('Choose 10, 25, 50 or 100 rows per page')
  return size
}
