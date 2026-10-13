import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const docker = async (args: string[]) =>
  (
    await exec('docker', args, { timeout: 30000, maxBuffer: 65536 })
  ).stdout.trim()
const root = await mkdtemp(join(tmpdir(), 'preflyt-native-receipt-db-'))
await chmod(root, 0o700)
let container: string | undefined
try {
  const password = randomBytes(24).toString('hex'),
    envFile = join(root, 'postgres.env')
  await writeFile(
    envFile,
    'POSTGRES_PASSWORD=' +
      password +
      '\nPGDATA=/var/lib/postgresql/data/pgdata\n',
    { mode: 0o600 },
  )
  // Empty, short-lived fixture server only; no persistent volume, application database or user credentials.
  container = await docker([
    'run',
    '--detach',
    '--name',
    'preflyt-native-receipt-test-' + randomBytes(6).toString('hex'),
    '--env-file',
    envFile,
    '--user',
    '999:999',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--pids-limit',
    '128',
    '--memory',
    '512m',
    '--cpus',
    '1',
    '--tmpfs',
    '/var/lib/postgresql/data:rw,nosuid,nodev,size=268435456,mode=0700,uid=999,gid=999',
    '--tmpfs',
    '/var/run/postgresql:rw,nosuid,nodev,size=16777216,mode=0770,uid=999,gid=999',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=16777216,mode=1777',
    '--publish',
    '127.0.0.1::5432',
    'postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4',
  ])
  if (!/^[a-f0-9]{64}$/.test(container))
    throw new Error('Invalid fixture container identity')
  let ready = false
  for (let n = 0; n < 30; n++) {
    ready = await docker([
      'exec',
      container,
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
    ]).then(
      () => true,
      () => false,
    )
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Disposable PostgreSQL is unavailable')
  const info = JSON.parse(await docker(['inspect', container]))[0]
  const binding = info.NetworkSettings.Ports['5432/tcp'][0]
  if (binding.HostIp !== '127.0.0.1' || !/^[0-9]{1,5}$/.test(binding.HostPort))
    throw new Error('Unsafe fixture database binding')
  const url =
    'postgresql://postgres:' +
    password +
    '@127.0.0.1:' +
    binding.HostPort +
    '/postgres'
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        'test/native-receipts.integration.test.ts',
        'test/native-requests.integration.test.ts',
      ],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } },
    )
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Native receipt fixtures failed')),
    )
  })
  console.info(
    'Native receipt persistence and request fixtures passed in an isolated database.',
  )
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container))
    await docker(['rm', '--force', container])
  await rm(root, { recursive: true, force: true })
}
