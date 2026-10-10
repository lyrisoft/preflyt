import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

// Metadata and database live in the approved read-only image, never the repository.
export async function verifyOfflineDatabase(root = '/opt/preflyt/trivy-cache/db', now = Date.now()) {
  const metadata = await open(root + '/metadata.json', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await metadata.stat()
    if (!stat.isFile() || stat.size < 1 || stat.size > 8192) throw new Error('Offline database metadata unavailable')
    const value = JSON.parse(await metadata.readFile('utf8'))
    const updatedAt = Date.parse(value.UpdatedAt)
    if (value.Version !== 2 || !Number.isFinite(updatedAt) || updatedAt > now || now - updatedAt > 86400000)
      throw new Error('Offline database is stale or incompatible')
    const database = await open(root + '/trivy.db', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try { if (!(await database.stat()).isFile() || (await database.stat()).size < 1) throw new Error('Offline database unavailable') }
    finally { await database.close() }
    return new Date(updatedAt).toISOString()
  } finally { await metadata.close() }
}
