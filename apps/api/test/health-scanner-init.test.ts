import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { initializeHealthScanner } from '../src/health/health-scanner-init.js'

it('initializes private volumes and copies only client TLS material, preserving identity and connection on restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'preflyt-health-init-'))
  const engineCertificates = join(directory, 'engine'), clientCertificates = join(directory, 'client')
  const directories = ['state', 'jobs', 'connection'].map(name => join(directory, name))
  const options = { directories, engineCertificates, clientCertificates, uid: process.getuid!(), gid: process.getgid!() }
  try {
    await mkdir(engineCertificates)
    for (const name of ['ca.pem', 'cert.pem', 'key.pem']) await writeFile(join(engineCertificates, name), '-----BEGIN ' + (name === 'key.pem' ? 'PRIVATE KEY' : 'CERTIFICATE') + '-----\nfixture')
    await writeFile(join(engineCertificates, 'server-key.pem'), 'must stay on the engine')
    await initializeHealthScanner(options)
    await writeFile(join(directories[0], 'identity.json'), 'preserved scanner identity', { mode: 0o600 })
    await writeFile(join(directories[2], 'connection.json'), 'preserved connection', { mode: 0o600 })
    await initializeHealthScanner(options)
    expect(await readFile(join(directories[0], 'identity.json'), 'utf8')).toBe('preserved scanner identity')
    expect(await readFile(join(directories[2], 'connection.json'), 'utf8')).toBe('preserved connection')
    expect((await readdir(clientCertificates)).sort()).toEqual(['ca.pem', 'cert.pem', 'key.pem'])
    for (const path of [...directories, clientCertificates]) expect((await stat(path)).mode & 0o777).toBe(0o700)
    for (const name of await readdir(clientCertificates)) expect((await stat(join(clientCertificates, name))).mode & 0o777).toBe(0o400)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('refuses symlinked scanner storage or certificate inputs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'preflyt-health-init-'))
  try {
    const engineCertificates = join(directory, 'engine'), clientCertificates = join(directory, 'client')
    await mkdir(engineCertificates)
    const linked = join(directory, 'linked')
    await symlink(engineCertificates, linked)
    const options = { directories: [linked], engineCertificates, clientCertificates, uid: process.getuid!(), gid: process.getgid!() }
    await expect(initializeHealthScanner(options)).rejects.toThrow('Unsafe scanner storage')
    await writeFile(join(directory, 'secret'), 'not a client certificate')
    await symlink(join(directory, 'secret'), join(engineCertificates, 'ca.pem'))
    await expect(initializeHealthScanner({ ...options, directories: [] })).rejects.toThrow()
    expect(await readdir(clientCertificates)).toEqual([])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
