import { afterEach, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
afterEach(() => vi.unstubAllEnvs())
it('refuses application, unrelated and remote databases before creating a Prisma client', () => {
  vi.stubEnv('NODE_ENV', 'test')
  for (const url of [
    'postgresql://fixture@localhost/preflyt',
    'postgresql://fixture@localhost/maiguard',
    'postgresql://fixture@remote.example/preflyt_test',
    'postgresql://fixture@localhost/preflyt_test_production-backup',
  ]) {
    vi.stubEnv('DATABASE_URL', url)
    expect(() => new PrismaService()).toThrow(
      'application databases are forbidden',
    )
  }
})
it('accepts only a local explicitly named disposable test database', async () => {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://fixture@127.0.0.1/preflyt_dashboard_test_boundary',
  )
  const db = new PrismaService()
  await db.$disconnect()
})
