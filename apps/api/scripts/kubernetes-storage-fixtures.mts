// Generated isolated storage fixture only; never connects to Preflyt's configured database.
import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { parseAllDocuments } from 'yaml'
import { dockerCommand } from '../src/execution/native-docker-job.js'
const docs = parseAllDocuments(
  await readFile(
    new URL('../../../deploy/kubernetes/resources.yaml', import.meta.url),
    'utf8',
  ),
).map((doc) => doc.toJSON())
const image = docs.find(
  (doc) => doc.kind === 'StatefulSet' && doc.metadata.name === 'db',
).spec.template.spec.containers[0].image
const root = await mkdtemp(join(tmpdir(), 'preflyt-kubernetes-storage-'))
const name = 'preflyt-storage-fixture-' + randomUUID()
let id: string | null = null
let built = false
const fixtureImage = 'preflyt-storage-fixture:' + randomUUID()
try {
  await chmod(root, 0o700)
  const script = join(root, 'init.sh'),
    env = join(root, 'database.env')
  await writeFile(
    script,
    await readFile(
      new URL('../../../deploy/postgres/01-runtime-role.sh', import.meta.url),
    ),
    { mode: 0o444 },
  )
  await writeFile(
    join(root, 'Dockerfile'),
    'FROM ' +
      image +
      '\nCOPY --chmod=0444 init.sh /docker-entrypoint-initdb.d/01-runtime-role.sh\n',
  )
  await writeFile(join(root, '.dockerignore'), '*\n!Dockerfile\n!init.sh\n')
  await dockerCommand(['build', '--quiet', '-t', fixtureImage, root], {
    timeoutMs: 60000,
  })
  built = true
  await writeFile(
    env,
    [
      'POSTGRES_USER=preflyt_owner',
      'POSTGRES_DB=preflyt',
      'PGDATA=/var/lib/postgresql/data/pgdata',
      'POSTGRES_PASSWORD=' + randomBytes(32).toString('hex'),
      'DATABASE_APP_PASSWORD=' + randomBytes(32).toString('hex'),
    ].join('\n'),
    { mode: 0o600 },
  )
  id = (
    await dockerCommand([
      'create',
      '--name',
      name,
      '--network',
      'none',
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
      '1g',
      '--cpus',
      '1',
      '--env-file',
      env,
      '--tmpfs',
      '/var/lib/postgresql/data:uid=999,gid=999,mode=0700,size=536870912',
      '--tmpfs',
      '/var/run/postgresql:uid=999,gid=999,mode=0770',
      '--tmpfs',
      '/tmp:mode=1777',
      fixtureImage,
    ])
  )
    .toString()
    .trim()
  assert.match(id, /^[a-f0-9]{64}$/)
  await dockerCommand(['start', id])
  const deadline = Date.now() + 60000
  let ready = false
  while (Date.now() < deadline) {
    const running = (
      await dockerCommand(['inspect', id, '--format', '{{.State.Running}}'])
    )
      .toString()
      .trim()
    if (running !== 'true') break
    await new Promise((resolve) => setTimeout(resolve, 1000))
    try {
      const result = await dockerCommand([
        'exec',
        id,
        'psql',
        '-U',
        'preflyt_owner',
        '-d',
        'preflyt',
        '-Atc',
        "SELECT rolname || ':' || rolsuper || ':' || rolcreatedb || ':' || rolcreaterole FROM pg_roles WHERE rolname='preflyt_app' AND current_setting('listen_addresses')='*'",
      ])
      if (result.toString().trim() === 'preflyt_app:false:false:false') {
        ready = true
        break
      }
    } catch {
      /* The empty fixture database is still initializing. */
    }
  }
  assert.ok(
    ready,
    'Restricted PostgreSQL initialization and runtime-role creation must succeed',
  )
  console.log(
    'Restricted PostgreSQL fixture initialized; application role has no superuser/create-database/create-role authority.',
  )
} finally {
  if (id) await dockerCommand(['rm', '--force', id])
  if (built) await dockerCommand(['image', 'rm', fixtureImage])
  await rm(root, { recursive: true, force: true })
}
