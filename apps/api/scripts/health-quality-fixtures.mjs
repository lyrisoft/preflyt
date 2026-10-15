// Trusted, generated source only. Static scanner acceptance does not qualify a runtime.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const image = process.env.PREFLYT_QUALITY_FIXTURE_IMAGE
assert.match(image ?? '', /^sha256:[a-f0-9]{64}$/, 'Provide the exact local image digest')
const root = mkdtempSync(resolve(tmpdir(), 'preflyt-quality-'))
const seeded = resolve(root, 'seeded'), clean = resolve(root, 'clean')
mkdirSync(seeded); mkdirSync(clean)
writeFileSync(resolve(seeded, 'app.js'), 'const bad = value === NaN;\ndebugger;\nconst digest = crypto.createHash("md5");\n')
writeFileSync(resolve(seeded, 'app.py'), 'try:\n    work()\nexcept:\n    pass\nexec(source)\nimport hashlib\nchecksum = hashlib.md5(source)\n')
writeFileSync(resolve(clean, 'app.js'), 'const bad = Number.isNaN(value);\n')
writeFileSync(resolve(clean, 'app.py'), 'try:\n    work()\nexcept ValueError:\n    recover()\nrun_handler(source)\n')
appendFileSync(resolve(seeded, 'app.js'), 'new Promise(async (resolve, reject) => { await work(); resolve(1); });\neval(source);\n')
appendFileSync(resolve(seeded, 'app.py'), `
def broken():
    try:
        work()
    finally:
        return 1
def collect(item, cache=[]):
    cache.append(item)
    return cache
def record(item, cache={}):
    cache[item] = item
    return cache
database.execute(f"SELECT * FROM products WHERE name = '{name}'")
`)
appendFileSync(resolve(clean, 'app.js'), 'async function workSafely() { return await work(); }\n')
appendFileSync(resolve(clean, 'app.py'), `
def clean():
    try:
        work()
    finally:
        cleanup()
    return 1
def collect(item, cache=None):
    if cache is None:
        cache = []
    cache.append(item)
    return cache
database.execute("SELECT * FROM products WHERE name = ?", (name,))
`)
appendFileSync(resolve(seeded, 'app.js'), `
const label = active ? (ready ? "ready" : "waiting") : "off";
try { work(); } catch (error) { throw error; }
`)
appendFileSync(resolve(seeded, 'app.py'), `
from helpers import *
try:
    work()
except ValueError:
    raise
`)
appendFileSync(resolve(clean, 'app.js'), `
const label = active ? "ready" : "off";
try { work(); } catch (error) { log(error); throw error; }
`)
appendFileSync(resolve(clean, 'app.py'), `
from helpers import work
try:
    work()
except ValueError:
    log_error()
    raise
`)
const typescriptSeeded=resolve(root,'typescript-seeded'),typescriptClean=resolve(root,'typescript-clean')
mkdirSync(typescriptSeeded);mkdirSync(typescriptClean)
writeFileSync(resolve(typescriptSeeded,'app.ts'),'const typed: number = 1;\n'+readFileSync(resolve(seeded,'app.js'),'utf8'))
writeFileSync(resolve(typescriptClean,'app.ts'),'const typed: number = 1;\n'+readFileSync(resolve(clean,'app.js'),'utf8'))
try {
 for (const [kind, count] of Object.entries({semgrep:3,reliability:4,maintainability:8,hotspots:2})) {
  for (const [directory, expected] of [[seeded, count], [clean, 0], [typescriptSeeded,{semgrep:1,reliability:2,maintainability:3,hotspots:1}[kind]], [typescriptClean,0]]) {
   const run = spawnSync('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '1g', '--cpus', '1', '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
    '--env', 'SEMGREP_SETTINGS_FILE=/tmp/settings.yml', '--env', 'SEMGREP_LOG_FILE=/tmp/semgrep.log', '--env', 'GIT_CONFIG_GLOBAL=/tmp/gitconfig', '--env', 'SEMGREP_SEND_METRICS=off', '--env', 'SEMGREP_ENABLE_VERSION_CHECK=0',
    '--mount', `type=bind,source=${directory},target=/workspace,readonly`, '--workdir', '/workspace', '--entrypoint', '/usr/local/bin/semgrep', image,
    'scan', '--config', `/opt/preflyt/config/${kind}.yaml`, '--metrics', 'off', '--disable-version-check', '--no-git-ignore', '--sarif', '--error', '/workspace'], { encoding:'utf8', timeout:120000, maxBuffer:1048576 })
   assert.equal(run.error, undefined)
   assert.equal(run.status, expected ? 1 : 0, run.stderr)
   const report = JSON.parse(run.stdout)
   const results = report.runs.flatMap(r => r.results ?? [])
   assert.equal(results.length, expected, `${kind} count`)
   if(expected) {
    const expectedRules={semgrep:['preflyt-js-eval','preflyt-python-dynamic-execution','preflyt-python-sql-fstring'],reliability:['preflyt-js-nan-comparison','preflyt-python-bare-except','preflyt-js-async-promise-executor','preflyt-python-return-finally'],maintainability:['preflyt-no-debugger','preflyt-python-exec-statement','preflyt-python-mutable-default','preflyt-js-nested-ternary','preflyt-js-redundant-catch','preflyt-python-wildcard-import','preflyt-python-redundant-reraise'],hotspots:['preflyt-js-md5-review','preflyt-python-md5-review']}[kind]
    assert.deepEqual([...new Set(results.map(result=>result.ruleId.split('.').at(-1)))].sort(),expectedRules.filter(rule=>directory!==typescriptSeeded || !rule.startsWith('preflyt-python-')).sort())
   }
   for (const result of results) {
    assert.match(result.ruleId, /preflyt-/)
    assert.ok(result.message.text.length > 20)
    const location = result.locations[0].physicalLocation
    assert.match(location.artifactLocation.uri, /app\.(js|py|ts)$/)
    assert.ok(location.region.startLine > 0)
   }
   console.log(`${kind}: ${expected ? 'seeded locations' : 'clean source'} passed`)
  }
 }
} finally { rmSync(root, {recursive:true, force:true}) }
