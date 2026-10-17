// Promote published application releases into source-pinned documentation snapshots.
// Runs in the manual docs workflow and after successful main image publication.
import {execFileSync} from 'node:child_process'
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath, pathToFileURL} from 'node:url'

const docs = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(docs, '../..')
const run = (command, args, options = {}) => execFileSync(command, args, {cwd: repo, encoding: 'utf8', ...options})
const stable = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const compare = (a,b) => {
  const x = a.replace(/^v/,'').split('.').map(BigInt), y = b.replace(/^v/,'').split('.').map(BigInt)
  for (let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i]?1:-1
  return 0
}
const through = process.env.DOCS_RELEASE_TAG || null
if (through && !stable.test(through)) throw new Error('Choose a stable published release tag, vX.Y.Z')
const versionsPath = resolve(docs,'versions.json'), metadataPath = resolve(repo,'release.json')
const versions = JSON.parse(readFileSync(versionsPath,'utf8'))
const metadata = JSON.parse(readFileSync(metadataPath,'utf8'))
const pages = JSON.parse(run('gh',['api','repos/lyrisoft/preflyt/releases','--paginate','--slurp']))
const releases = pages.flat().filter(r => !r.draft && !r.prerelease && stable.test(r.tag_name) && /<!-- preflyt-release-ready:v1 sha=[a-f0-9]{40} -->/.test(r.body ?? '') && (!through || compare(r.tag_name,through)<=0)).sort((a,b)=>compare(a.tag_name,b.tag_name))
if (!releases.length || (through && !releases.some(r=>r.tag_name===through))) throw new Error('The requested published release has no verified image-readiness marker')
if(compare(releases.at(-1).tag_name,metadata.latestStable)<0) throw new Error('Refusing to downgrade the default documentation version')
const created = []
try {
  for (const release of releases) {
    const version = release.tag_name.slice(1)
    const sha = run('git',['rev-parse',`${release.tag_name}^{commit}`]).trim()
    const marker = /<!-- preflyt-release-ready:v1 sha=([a-f0-9]{40}) -->/.exec(release.body)?.[1]
    if (sha !== marker) throw new Error(`${release.tag_name}: publication marker and source tag differ`)
    const target = resolve(docs,`versioned_docs/version-${version}`)
    const downloads = resolve(docs,`static/downloads/${version}`)
    const sidebar = resolve(docs,`versioned_sidebars/version-${version}-sidebars.json`)
    if (versions.includes(version)) {
      if (!existsSync(target) || !existsSync(downloads) || !existsSync(sidebar)) throw new Error(`${version}: incomplete frozen snapshot`)
      const provenance = resolve(downloads,'source.json')
      if (existsSync(provenance) && JSON.parse(readFileSync(provenance,'utf8')).sha !== sha) throw new Error(`${version}: frozen source changed`)
      continue
    }
    if (existsSync(target) || existsSync(downloads) || existsSync(sidebar)) throw new Error(`${version}: refusing to overwrite frozen files`)
    created.push(target,downloads,sidebar)
    const scratch = mkdtempSync(resolve(tmpdir(),'preflyt-docs-release-'))
    try {
      const archive = resolve(scratch,'source.tar')
      run('git',['archive','--format=tar',`--output=${archive}`,sha,'apps/docs/docs','apps/docs/sidebars.ts'])
      run('tar',['-xf',archive,'-C',scratch])
      mkdirSync(resolve(docs,'versioned_docs'),{recursive:true})
      cpSync(resolve(scratch,'apps/docs/docs'),target,{recursive:true})
      run(process.execPath,[resolve(docs,'scripts/generate-downloads.mjs'),`--version=${version}`,`--source-ref=${sha}`,`--content-root=${target}`],{stdio:'inherit'})
      const sourceSidebar = pathToFileURL(resolve(scratch,'apps/docs/sidebars.ts')).href
      const content = run(process.execPath,['--input-type=module','-e',`const {default:sidebar}=await import(${JSON.stringify(sourceSidebar)});process.stdout.write(JSON.stringify(sidebar,null,2))`])
      mkdirSync(resolve(docs,'versioned_sidebars'),{recursive:true})
      writeFileSync(sidebar,content+'\n')
      writeFileSync(resolve(downloads,'source.json'),JSON.stringify({version,sha,release:release.html_url},null,2)+'\n')
      versions.push(version)
      console.log(`Frozen documentation ${release.tag_name} from ${sha}`)
    } finally {rmSync(scratch,{recursive:true,force:true})}
  }
  versions.sort((a,b)=>compare(b,a))
  const newest = releases.at(-1)
  const sha = run('git',['rev-parse',`${newest.tag_name}^{commit}`]).trim()
  metadata.latestStable = newest.tag_name.slice(1)
  metadata.nextImageTag = `sha-${sha}`
  writeFileSync(versionsPath,JSON.stringify(versions,null,2)+'\n')
  writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n')
  console.log(`Default documentation: ${newest.tag_name}; Next remains unreleased`)
} catch (error) {
  for (const path of created) rmSync(path,{recursive:true,force:true})
  throw error
}
