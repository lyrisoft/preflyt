// Collect exact installed-package notices. This is evidence, not legal clearance.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const hash = text => createHash('sha256').update(text).digest('hex')
const manifest = async directory => JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
const noticeName = /^(?:licen[cs]e|notice|copying|copyright)(?:$|[._-])/i

export async function packageNotices(directory, prefix = '') {
  const notices = []
  for (const entry of (await readdir(join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) notices.push(...await packageNotices(directory, path))
    else if (entry.isFile() && noticeName.test(entry.name)) {
      const content = await readFile(join(directory, path), 'utf8')
      notices.push({ path, sha256: hash(content), content })
    }
  }
  return notices
}

export async function writeLicenseBundle(directories, output, scope) {
  const packages = new Map()
  for (const directory of [...new Set(directories)]) {
    const pkg = await manifest(directory)
    const id = `${pkg.name}@${pkg.version}`
    const notices = await packageNotices(directory)
    const declaredLicense = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'NOASSERTION'
    const record = { name: pkg.name, version: pkg.version, declaredLicense, notices }
    if (packages.has(id) && JSON.stringify(packages.get(id)) !== JSON.stringify(record)) throw new Error(`Conflicting package notices for ${id}`)
    packages.set(id, record)
  }
  const records = [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))
  const reviewRequired = records.filter(p => p.declaredLicense === 'NOASSERTION' || !p.notices.length).map(p => `${p.name}@${p.version}`)
  const inventory = { formatVersion: 1, scope, reviewRequired, packages: records.map(({ notices, ...p }) => ({ ...p, notices: notices.map(({ content, ...notice }) => notice) })) }
  const text = [
    'Preflyt third-party package notices',
    `Scope: ${scope}`,
    'Upstream terms remain in force. This generated collection does not grant rights or establish clearance.',
    'Packages without license text require review; their metadata alone is not a replacement notice.',
    ...records.map(p => `\n${'='.repeat(72)}\n${p.name}@${p.version}\nDeclared license: ${p.declaredLicense}\n${p.notices.map(n => `\n--- ${n.path} ---\n${n.content}`).join('\n') || 'License text missing from the installed package; review required.'}`),
  ].join('\n') + '\n'
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'third-party-licenses.txt'), text)
  await writeFile(join(output, 'third-party-inventory.json'), JSON.stringify(inventory, null, 2) + '\n')
  return inventory
}

export async function installedGraph(source, includeDev = false) {
  const directories = new Set()
  async function locate(from, name) {
    for (let current = from; ; current = dirname(current)) {
      try { return await realpath(join(current, 'node_modules', name)) }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      if (current === dirname(current)) return null
    }
  }
  async function visit(directory, root = false) {
    if (!root) {
      if (directories.has(directory)) return
      directories.add(directory)
    }
    const pkg = await manifest(directory)
    const dependencies = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies, ...(root && includeDev ? pkg.devDependencies : {}) }
    for (const name of Object.keys(dependencies).sort()) {
      const child = await locate(directory, name)
      if (child) await visit(child)
      else if (!(name in (pkg.optionalDependencies ?? {})) && !pkg.peerDependenciesMeta?.[name]?.optional) throw new Error(`Missing installed dependency: ${pkg.name} -> ${name}`)
    }
  }
  await visit(resolve(source), true)
  return [...directories]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [source, output, scope, flag] = process.argv.slice(2)
  if (!source || !output || !scope || (flag && flag !== '--include-dev')) throw new Error('Usage: license-bundle.mjs SOURCE OUTPUT SCOPE [--include-dev]')
  const result = await writeLicenseBundle(await installedGraph(source, flag === '--include-dev'), output, scope)
  console.info(`${scope}: ${result.packages.length} package versions; ${result.reviewRequired.length} need notice/metadata review`)
}
