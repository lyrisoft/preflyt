// Verify user-visible version identity and exact deployment artifacts after build.
import assert from 'node:assert/strict'
import {readFileSync, mkdtempSync, rmSync} from 'node:fs'
import {resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const release = JSON.parse(readFileSync(resolve(root, '../../release.json')))
const text = html => html.replace(/<[^>]*>/g, '').replace(/<!--.*?-->/gs, '').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
const readPage = path => readFileSync(resolve(root, 'build', path), 'utf8')
const versions = JSON.parse(readFileSync(resolve(root, 'versions.json')))
for (const [version, prefix, tag] of [...versions.map(version => [version, version === release.latestStable ? '' : `${version}/`, `v${version}`]), ['next', 'next/', release.nextImageTag]]) {
  const home = readPage(prefix ? `${prefix.slice(0, -1)}.html` : 'index.html')
  const footer = [...home.matchAll(/<footer[\s\S]*?<\/footer>/g)].at(-1)?.[0] ?? ''
  assert(footer.includes(`/${prefix}self-hosting/docker-compose`), 'Footer must preserve the selected version')
  assert(home.includes(version === 'next' ? 'Preflyt Next (unreleased)' : `Preflyt ${tag}`), 'Landing badge must match selected docs')
  assert(!home.includes('Preflyt-v0.1.1'), 'Outdated badge must not return')
  for (const page of ['getting-started/quick-start', 'self-hosting/docker-compose']) {
    const html = readPage(`${prefix}${page}.html`)
    const body = text(html)
    assert(body.includes(`PREFLYT_VERSION=${tag}`), `${version}: copyable install version`)
    assert(body.includes(`/downloads/${version}/compose.yaml`), `${version}: versioned Compose download`)
    assert(!body.includes('REPLACE_WITH_PUBLISHED_VERSION'), `${version}: unresolved install version`)
    if (version === 'next') assert(/unreleased documentation/i.test(body), 'Next banner must be visible')
    else assert(!body.includes(release.nextImageTag), 'Stable examples must not use Next images')
  }
  const kube = text(readPage(`${prefix}self-hosting/kubernetes.html`))
  assert(kube.includes(`/downloads/${version}/kubernetes.tgz`), 'Kubernetes download must follow selected version')
  const env = readFileSync(resolve(root, `build/downloads/${version}/preflyt.env.example`), 'utf8')
  assert(env.includes(`PREFLYT_VERSION=${tag}\n`), 'Downloaded settings must match selected docs')
  const staging = mkdtempSync(resolve(tmpdir(), 'preflyt-doc-version-check-'))
  try {
    execFileSync('tar', ['-xzf', resolve(root, `build/downloads/${version}/kubernetes.tgz`), '-C', staging])
    for (const name of ['resources.yaml', 'migration.yaml']) {
      const yaml = readFileSync(resolve(staging, 'kubernetes', name), 'utf8')
      const images = [...yaml.matchAll(/image: (ghcr\.io\/lyrisoft\/preflyt-[^\s]+)/g)].map(m => m[1])
      assert(images.length > 0)
      assert(images.every(image => image.endsWith(`:${tag}`)), `${version}: Kubernetes image mismatch`)
    }
  } finally {rmSync(staging, {recursive: true, force: true})}
}
console.log('Documentation versions verified: badges, Next banner, install examples and frozen downloads.')
