// Trusted image-owned wrapper. Repository files never supply commands, arguments or environment.
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import {normalizeSemgrepLocations} from './semgrep-locations.mjs'
import { verifyMountedNativeSource } from './source-verification.mjs'
import adapters from './adapters.json' with { type: 'json' }
const adapter = Object.hasOwn(adapters, process.argv[2]) ? adapters[process.argv[2]] : null
let verifiedSourceHash = null
const reply = (exitCode, report) => {
  process.stdout.write(JSON.stringify({ version: 2, sourceHash: verifiedSourceHash, exitCode, report }) + '\n')
  process.exitCode = [0, 1].includes(exitCode) ? exitCode : 2
}
if (!adapter || process.argv.length !== 3) reply(2, null)
else {
  try { verifiedSourceHash = await verifyMountedNativeSource('/workspace', {
    repositoryId: process.env.PREFLYT_SOURCE_REPOSITORY, sourceSha: process.env.PREFLYT_SOURCE_SHA,
    sourceHash: process.env.PREFLYT_SOURCE_HASH,
  }) } catch { reply(2,null) }
  if (verifiedSourceHash && process.argv[2] === 'security.dependencies') {
    try { await (await import('./offline-database.mjs')).verifyOfflineDatabase() }
    catch { verifiedSourceHash = null; reply(2, null) }
  }
  if (verifiedSourceHash) {
  const child = spawn(adapter.command[0], adapter.args, {
    cwd: '/workspace', stdio: ['ignore', 'ignore', 'ignore'],
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/scratch', TMPDIR: '/scratch', LANG: 'C.UTF-8', SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0' },
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 285000)
  let responded = false
  child.once('error', () => { clearTimeout(timer); responded = true; reply(2, null) })
  child.once('close', async code => {
    clearTimeout(timer)
    if (responded) return
    try { await verifyMountedNativeSource('/workspace', {
      repositoryId: process.env.PREFLYT_SOURCE_REPOSITORY, sourceSha: process.env.PREFLYT_SOURCE_SHA,
      sourceHash: process.env.PREFLYT_SOURCE_HASH,
    }) } catch { verifiedSourceHash = null; reply(2,null); return }
    let report = null
    try {
      const handle = await open(adapter.format === 'junit' ? '/reports/report.xml' : '/reports/report.sarif', constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size < 1 || stat.size > 262144) throw new Error('Report unavailable')
        // Read at most the validated limit even if a malicious test grows the file concurrently.
        const bytes = Buffer.alloc(262145)
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
        if (bytesRead > 262144 || bytesRead !== stat.size) throw new Error('Report changed')
        const raw = bytes.subarray(0, bytesRead)
        // Only the trusted mounted root is translated; source validation remains strict.
        report = adapter.format === 'sarif' ? Buffer.from(JSON.stringify(normalizeSemgrepLocations(JSON.parse(raw.toString('utf8'))))).toString('base64') : raw.toString('base64')
        if (report.length > 349528) throw new Error('Report exceeds bounds')
      } finally { await handle.close() }
    } catch { /* Missing, symlinked, special, oversized or changing reports are incomplete. */ }
    reply(code, report)
  })
}

}
