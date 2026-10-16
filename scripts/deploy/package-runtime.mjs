// Export installed dependency graphs without build tools pulled through optional peers.
// Package contents (including licenses, native binaries and bundled dependencies) stay intact.
import { builtinModules, createRequire } from 'node:module'
import { cp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeLicenseBundle } from './license-bundle.mjs'

async function installedPackage(from, name) {
  for (let directory = from; ; directory = dirname(directory)) {
    try { return await realpath(join(directory, 'node_modules', name)) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (directory === dirname(directory)) throw new Error('Missing runtime dependency: ' + name)
  }
}
const manifest = async directory => JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
export async function exportDependencies(source, output, roots) {
  const packages = new Map()
  async function visit(from, name) {
    const directory = await installedPackage(from, name)
    if (packages.has(directory)) return packages.get(directory)
    const pkg = await manifest(directory)
    const record = { directory, pkg, destination: join(output, 'node_modules/.store', String(packages.size), 'node_modules', pkg.name), links: [] }
    packages.set(directory, record)
    const dependencies = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }
    for (const dependency of Object.keys(dependencies).sort()) {
      // Prisma's CLI and TypeScript are optional generator peers, not client runtime dependencies.
      if (pkg.name === '@prisma/client' && ['prisma', 'typescript'].includes(dependency) && pkg.peerDependenciesMeta?.[dependency]?.optional) continue
      let child
      try { child = await visit(directory, dependency) }
      catch (error) {
        if ((dependency in (pkg.optionalDependencies ?? {}) || pkg.peerDependenciesMeta?.[dependency]?.optional) && error.message === 'Missing runtime dependency: ' + dependency) continue
        throw error
      }
      record.links.push([dependency, child])
    }
    return record
  }
  const rootLinks = []
  for (const name of [...roots].sort()) rootLinks.push([name, await visit(source, name)])
  for (const record of packages.values()) await cp(record.directory, record.destination, { recursive: true, verbatimSymlinks: true })
  async function link(base, name, child) {
    const target = join(base, name)
    await mkdir(dirname(target), { recursive: true })
    await symlink(relative(dirname(target), child.destination), target)
  }
  for (const record of packages.values()) {
    const base = join(record.destination, ...Array(record.pkg.name.startsWith('@') ? 2 : 1).fill('..'))
    for (const [name, child] of record.links) await link(base, name, child)
  }
  for (const [name, child] of rootLinks) await link(join(output, 'node_modules'), name, child)
  await writeFile(join(output, 'runtime-dependencies.json'), JSON.stringify([...packages.values()].map(({ pkg }) => ({ name: pkg.name, version: pkg.version })), null, 2) + '\n')
  await writeLicenseBundle([...packages.keys()], join(output, 'licenses'), 'Installed Node.js runtime dependencies')
}

export async function entryDependencies(source, entries) {
  const require = createRequire(join(source, 'package.json'))
  const ts = require('typescript'), files = new Set(), packages = new Set()
  async function visit(file) {
    file = resolve(file)
    if (files.has(file)) return
    files.add(file)
    const text = await readFile(file, 'utf8'), imports = []
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) imports.push(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw new Error('Nonliteral runtime import in ' + file)
        imports.push(node.arguments[0].text)
      }
      ts.forEachChild(node, walk)
    }
    walk(tree)
    for (const name of imports) {
      if (name.startsWith('.')) await visit(resolve(dirname(file), name))
      else if (!name.startsWith('node:') && !builtinModules.includes(name)) packages.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0])
    }
  }
  for (const entry of entries) await visit(join(source, 'dist', entry))
  return [...packages]
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [source, output, mode] = process.argv.slice(2)
  if (!source || !output || !['api', 'migration', 'scanner'].includes(mode)) throw new Error('Expected source, output and api/migration/scanner')
  await mkdir(output, { recursive: true })
  const pkg = await manifest(source)
  const roots = mode === 'api' ? Object.keys(pkg.dependencies) : mode === 'migration' ? ['prisma', 'dotenv'] : await entryDependencies(source, ['health-scanner.js', 'health/health-scanner-readiness.js'])
  await exportDependencies(source, output, roots)
  await writeFile(join(output, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, type: 'module' }) + '\n')
}
