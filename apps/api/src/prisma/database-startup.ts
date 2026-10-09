import { setTimeout as sleep } from 'node:timers/promises'
const transient = new Set([
  '57P03',
  '57P01',
  '57P02',
  'P1001',
  'P1002',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
])
// Prisma 7 wraps PostgreSQL SQLSTATE in meta.driverAdapterError.cause.
export function databaseStartupCode(error: unknown): string | null {
  const queue: unknown[] = [error]
  const seen = new Set<unknown>()
  while (queue.length && seen.size < 16) {
    const item = queue.shift()
    if (!item || typeof item !== 'object' || seen.has(item)) continue
    seen.add(item)
    const value = item as Record<string, unknown>
    for (const key of ['code', 'originalCode'])
      if (typeof value[key] === 'string' && transient.has(value[key]))
        return value[key] as string
    for (const key of ['cause', 'meta', 'driverAdapterError'])
      if (value[key]) queue.push(value[key])
  }
  return null
}
export async function withDatabaseStartupRetry<T>(
  label: string,
  operation: () => Promise<T>,
  options: {
    timeoutMs?: number
    now?: () => number
    wait?: (ms: number) => Promise<unknown>
    warn?: (message: string) => void
  } = {},
): Promise<T> {
  const timeout = options.timeoutMs ?? 60000
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > 120000)
    throw new Error('Invalid database startup timeout')
  const now = options.now ?? (() => performance.now())
  const wait = options.wait ?? sleep
  const started = now()
  let attempts = 0
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      const code = databaseStartupCode(error)
      if (!code) throw error
      const remaining = timeout - (now() - started)
      if (remaining <= 0 || attempts >= 60)
        throw new Error(
          'PostgreSQL did not become available during startup. Check database health and disk space before restarting Preflyt.',
        )
      if (!attempts)
        (options.warn ?? console.warn)(
          `PostgreSQL is temporarily unavailable (${code}); waiting before ${label}. Check database disk space if recovery continues.`,
        )
      attempts++
      await wait(
        Math.min(200 * 2 ** Math.min(attempts - 1, 4), 2000, remaining),
      )
    }
  }
}
