import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// Image-owned module is exercised directly; no connected repository or network is involved.
// @ts-expect-error Deployment JavaScript has no TypeScript declarations.
import { verifyOfflineDatabase } from '../../../docs/deployment/native-runner/offline-database.mjs'
it('requires a real database and recent vendor update metadata rather than download time', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflyt-offline-db-'))
  const now = Date.now()
  const metadata = (updatedAt: number, version = 2) => writeFile(join(root, 'metadata.json'), JSON.stringify({ Version: version, UpdatedAt: new Date(updatedAt).toISOString(), DownloadedAt: new Date(now).toISOString() }))
  try {
    await expect(verifyOfflineDatabase(root, now)).rejects.toThrow()
    await metadata(now - 1000)
    await expect(verifyOfflineDatabase(root, now)).rejects.toThrow()
    await writeFile(join(root, 'trivy.db'), 'fixture database bytes')
    expect(await verifyOfflineDatabase(root, now)).toBe(new Date(now - 1000).toISOString())
    await metadata(now - 86400001)
    await expect(verifyOfflineDatabase(root, now)).rejects.toThrow('stale')
    await metadata(now + 1000)
    await expect(verifyOfflineDatabase(root, now)).rejects.toThrow('stale')
    await metadata(now - 1000, 1)
    await expect(verifyOfflineDatabase(root, now)).rejects.toThrow('incompatible')
  } finally { await rm(root, { recursive: true, force: true }) }
})
