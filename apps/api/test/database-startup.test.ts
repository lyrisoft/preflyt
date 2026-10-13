import { describe, expect, it, vi } from 'vitest'
import {
  databaseStartupCode,
  withDatabaseStartupRetry,
} from '../src/prisma/database-startup.js'
const recovery = () => ({
  code: 'P2039',
  meta: { driverAdapterError: { cause: { originalCode: '57P03' } } },
})
const clock = (timeoutMs = 60000) => {
  let time = 0
  return {
    timeoutMs,
    now: () => time,
    wait: vi.fn(async (ms: number) => {
      time += ms
    }),
    warn: vi.fn(),
  }
}
describe('PostgreSQL startup recovery', () => {
  it('finds SQLSTATE in the actual Prisma adapter error shape', () =>
    expect(databaseStartupCode(recovery())).toBe('57P03'))
  it('retries recovery, then completes initialization exactly once', async () => {
    const opts = clock(),
      op = vi
        .fn()
        .mockRejectedValueOnce(recovery())
        .mockRejectedValueOnce(recovery())
        .mockResolvedValue('ready')
    await expect(
      withDatabaseStartupRetry('initialization', op, opts),
    ).resolves.toBe('ready')
    expect(op).toHaveBeenCalledTimes(3)
    expect(opts.wait.mock.calls.map((c) => c[0])).toEqual([200, 400])
    expect(opts.warn).toHaveBeenCalledTimes(1)
  })
  it('does not retry authentication, schema errors, read-only standby or arbitrary failures', async () => {
    for (const error of [
      { code: '28P01' },
      { code: 'P2021' },
      {
        code: 'P2039',
        meta: { driverAdapterError: { cause: { originalCode: '42501' } } },
      },
      new Error('read-only primary'),
      new Error('programming error'),
    ]) {
      const op = vi.fn().mockRejectedValue(error),
        opts = clock()
      await expect(
        withDatabaseStartupRetry('initialization', op, opts),
      ).rejects.toBe(error)
      expect(opts.wait).not.toHaveBeenCalled()
    }
  })
  it('stops at its retry deadline with actionable redacted advice', async () => {
    const opts = clock(500),
      op = vi
        .fn()
        .mockRejectedValue({ ...recovery(), message: 'secret-db-url' })
    await expect(
      withDatabaseStartupRetry('initialization', op, opts),
    ).rejects.toThrow('Check database health and disk space')
    expect(opts.wait.mock.calls.map((c) => c[0])).toEqual([200, 300])
    expect(op).toHaveBeenCalledTimes(3)
    expect(opts.warn.mock.calls[0][0]).not.toContain('secret-db-url')
  })
  it('bounds traversal of circular errors and accepts transient connection failures', async () => {
    const e: any = {}
    e.cause = e
    expect(databaseStartupCode(e)).toBeNull()
    const op = vi
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNREFUSED' })
      .mockResolvedValue(undefined)
    await withDatabaseStartupRetry('initialization', op, clock())
    expect(op).toHaveBeenCalledTimes(2)
  })
})

import { PrismaService } from '../src/prisma/prisma.service.js'
it('readiness checks a writable primary rather than only lazy Prisma connect', async () => {
  const raw = vi.fn().mockResolvedValue([{ writable: true }])
  const client = {
    $connect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn(async (cb: any) => cb({ $queryRawUnsafe: raw })),
  }
  await PrismaService.prototype.waitUntilWritable.call(client as any)
  expect(raw.mock.calls[0][0]).toContain('pg_is_in_recovery()')
  expect(client.$transaction.mock.calls[0][1]).toEqual({
    maxWait: 5000,
    timeout: 5000,
  })
  raw.mockResolvedValue([{ writable: false }])
  await expect(
    PrismaService.prototype.waitUntilWritable.call(client as any),
  ).rejects.toThrow('writable primary')
})
