import { withDatabaseStartupRetry } from './database-startup.js'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is required')
    if (process.env.NODE_ENV === 'test') {
      const database = new URL(connectionString)
      if (
        !['127.0.0.1', 'localhost'].includes(database.hostname) ||
        !/^\/preflyt_(?:[a-z0-9_]+_)?test(?:_[a-z0-9_]+)?$/.test(
          database.pathname,
        )
      )
        throw new Error(
          'Tests require a local disposable Preflyt test database; application databases are forbidden',
        )
    }
    super({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 5000,
      }),
    })
  }
  async waitUntilWritable() {
    await withDatabaseStartupRetry('database initialization', async () => {
      await this.$connect()
      const state = await this.$transaction(
        async (tx) =>
          tx.$queryRawUnsafe<Array<{ writable: boolean }>>(
            "SELECT NOT pg_is_in_recovery() AND current_setting('transaction_read_only') = 'off' AS writable",
          ),
        { maxWait: 5000, timeout: 5000 },
      )
      if (state[0]?.writable !== true)
        throw new Error(
          'Preflyt requires a writable primary PostgreSQL database; the configured database is read-only or a standby.',
        )
    })
  }
  async onModuleInit() {
    await this.waitUntilWritable()
  }
  async onModuleDestroy() {
    await this.$disconnect()
  }
}
