// One-shot Compose bootstrap. Only this process sees engine-generated client certificates.
import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { chmod, chown, lstat, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function initializeHealthScanner(options: {
  directories: string[]
  engineCertificates: string
  clientCertificates: string
  uid: number
  gid: number
}) {
  for (const directory of [...options.directories, options.clientCertificates]) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe scanner storage')
    await chown(directory, options.uid, options.gid)
    await chmod(directory, 0o700)
  }
  for (const name of ['ca.pem', 'cert.pem', 'key.pem']) {
    const file = await open(join(options.engineCertificates, name), constants.O_RDONLY | constants.O_NOFOLLOW)
    let content: string
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > 16384) throw new Error('Invalid engine certificate')
      content = await file.readFile('utf8')
      if (!/^-----BEGIN (?:CERTIFICATE|(?:RSA |EC )?PRIVATE KEY)-----/.test(content)) throw new Error('Invalid engine certificate')
    } finally { await file.close() }
    const target = join(options.clientCertificates, name)
    const temporary = target + '.' + randomUUID() + '.tmp'
    try {
      await writeFile(temporary, content, { mode: 0o400, flag: 'wx' })
      await chown(temporary, options.uid, options.gid)
      await rename(temporary, target)
    } finally { await rm(temporary, { force: true }) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await initializeHealthScanner({
    directories: ['/var/lib/preflyt/health-scanner', '/var/lib/preflyt/health-jobs', '/var/lib/preflyt/health-connection'],
    engineCertificates: '/engine-certs/client', clientCertificates: '/run/docker-tls', uid: 1000, gid: 1000,
  })
  console.info('Preflyt Health storage and engine connection are ready.')
}
