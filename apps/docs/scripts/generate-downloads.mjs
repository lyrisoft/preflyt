// Builds the files a user downloads, from the repository's own deployment files,
// so the published instructions can never drift from what the project ships:
//
//   static/downloads/compose.yaml    standalone Docker Compose file (no source checkout needed)
//   static/downloads/backup.sh       standalone backup helper
//   static/downloads/restore.sh      standalone restore helper
//   static/downloads/kubernetes.tgz  the Kubernetes manifest bundle
//   docs/self-hosting/compose-file.md  the compose file, shown on the site
//   docs/_generated/*.md             copyable code blocks imported by the guides:
//                                    compose-yaml, env-local, env-production
//
// Run automatically before `dev` and `build`.
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Scalar, isMap, isScalar, isSeq, parseDocument } from 'yaml'

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(docs, '../..')
const release = JSON.parse(readFileSync(resolve(repo, 'release.json'), 'utf8'))
const version = process.argv.find(arg => arg.startsWith('--version='))?.split('=')[1] ?? 'next'
if (version !== 'next' && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid documentation version')
const sourceRef = process.argv.find(arg => arg.startsWith('--source-ref='))?.split('=')[1]
const imageTag = version === 'next' ? release.nextImageTag : `v${version}`
if (!/^(v\d+\.\d+\.\d+|sha-[a-f0-9]{40})$/.test(imageTag)) throw new Error('Invalid published image tag')
const out = resolve(docs, 'static/downloads', version)
if (version !== 'next' && (!sourceRef || existsSync(out))) {
  throw new Error('Release downloads require a source ref and a new output directory; frozen releases must not be overwritten')
}
mkdirSync(out, { recursive: true })

const registry = process.env.PREFLYT_DOCS_REGISTRY ?? 'ghcr.io/lyrisoft'
const read = (path) => sourceRef
  ? execFileSync('git', ['show', `${sourceRef}:${path}`], {cwd: repo, encoding: 'utf8'})
  : readFileSync(resolve(repo, path), 'utf8')

/** Compose interpolates `$` inside inline config content, so keep it literal. */
const literal = (text) => text.replace(/\$/g, '$$$$')

const source = parseDocument(read('docker-compose.yaml'))
const services = source.get('services')
if (!isMap(services)) throw new Error('docker-compose.yaml has no services')

const inline = new Map() // config name -> file content

for (const { key, value } of services.items.map((item) => ({ key: item.key.value, value: item.value }))) {
  if (!isMap(value)) continue
  value.delete('build')

  const image = value.get('image')
  if (typeof image === 'string' && image.includes('${PREFLYT_IMAGE_REGISTRY')) {
    value.set(
      'image',
      image
        .replace('${PREFLYT_IMAGE_REGISTRY:-preflyt-local}', `\${PREFLYT_IMAGE_REGISTRY:-${registry}}`)
        .replace(
          '${PREFLYT_VERSION:-development}',
          '${PREFLYT_VERSION:?Set PREFLYT_VERSION to a published release, vX.Y.Z or sha-<40-character commit ID>}'
        )
    )
  }

  // Bind mounts from the repository become inline configs.
  const volumes = value.get('volumes')
  if (isSeq(volumes)) {
    const keep = []
    for (const item of volumes.items) {
      const spec = isScalar(item) ? String(item.value) : null
      const match = spec?.match(/^\.\/(deploy\/[^:]+):([^:]+)(?::ro)?$/)
      if (!match) {
        keep.push(item)
        continue
      }
      const [, file, target] = match
      const name = file.includes('postgres') ? 'db_init' : 'otel_collector'
      inline.set(name, read(file))
      const configs = value.get('configs') ?? source.createNode([])
      const mode = new Scalar(target.endsWith('.sh') ? 0o555 : 0o444)
      mode.format = 'OCT'
      const entry = source.createNode({ source: name, target })
      entry.set('mode', mode)
      configs.items.push(entry)
      value.set('configs', configs)
    }
    if (keep.length) volumes.items = keep
    else value.delete('volumes')
  }

  // Local trial switch for the API and worker (production defaults otherwise).
  const environment = value.get('environment')
  if (isMap(environment) && (key === 'api' || key === 'worker')) {
    environment.set('NODE_ENV', '${PREFLYT_NODE_ENV:-production}')
    if (key === 'api') environment.set('COOKIE_SECURE', "${PREFLYT_COOKIE_SECURE:-true}")
  }
}

const configs = {}
for (const [name, content] of inline) configs[name] = { content: literal(content) }
source.set('configs', source.createNode(configs))

const header = `# Preflyt standalone Docker Compose file.
# Generated from the project's docker-compose.yaml; do not edit by hand.
#
# Requires Docker Compose v2.23.1 or later (inline configs).
# Settings come from a .env file next to this file. See the Quick Start.
#
# PREFLYT_NODE_ENV=development and PREFLYT_COOKIE_SECURE=false are for a local
# http://localhost trial only. Never set them on a deployment others can reach.
`
const compose = header + source.toString({ lineWidth: 0, flowCollectionPadding: false })
writeFileSync(resolve(out, 'compose.yaml'), compose)

// The same file, shown on the site.
writeFileSync(
  resolve(docs, 'docs/self-hosting/compose-file.md'),
  `---
id: compose-file
title: Compose file
sidebar_label: Compose file
description: The standalone Docker Compose file used to run Preflyt, generated from the project.
---

<!-- Generated by scripts/generate-downloads.mjs. Do not edit. -->

# Compose file

This is the file you download in the [Quick Start](../getting-started/quick-start.md). It is generated from the project's own deployment files, so it always matches the images it starts.

Download it: [\`compose.yaml\`](pathname:///downloads/${version}/compose.yaml)

## How it differs from the repository's \`docker-compose.yaml\`

The services, health checks, networks, volumes and security settings are identical. Only what a source checkout provides is replaced, so the file works on its own:

| Repository file | This file | Why |
| --- | --- | --- |
| \`build:\` sections | Removed | You pull published images instead of building them. |
| Image registry \`preflyt-local\` | \`${registry}\` | Where the published images live. |
| \`PREFLYT_VERSION\` defaults to \`development\` | **Required** | You must choose a release. There is no default to run by accident. |
| \`./deploy/...\` file mounts | Inline \`configs\` | The database setup script and the optional telemetry collector settings are embedded, so there are no extra files to download. This is why Compose 2.23.1 is needed. |
| \`NODE_ENV\` and \`COOKIE_SECURE\` fixed to production values | \`PREFLYT_NODE_ENV\` and \`PREFLYT_COOKIE_SECURE\`, defaulting to production | Lets the local trial run over \`http://localhost\`. Leave them unset on a real deployment. |

\`\`\`yaml title="compose.yaml"
${compose.trimEnd()}
\`\`\`
`
)

// ---- Copyable snippets shown in the guides --------------------------------

const generated = resolve(docs, 'docs/_generated')
mkdirSync(generated, { recursive: true })
const fence = (lang, title, body) => '```' + lang + ' title="' + title + '"\n' + body.trimEnd() + '\n```\n'

writeFileSync(resolve(generated, 'compose-yaml.md'), fence('yaml', 'compose.yaml', compose))

// The settings file. Variables listed here are the ones a reader must set.
const envLines = (local) => `# Preflyt settings. Keep this file private: chmod 600 .env
#
# Image tag matching the selected documentation version (${version}).
PREFLYT_VERSION=${imageTag}

# Optional installation reporting (enabled by default). Set false before startup to opt out.
# No data is sent until a reporting receiver is configured.
PREFLYT_INSTALLATION_REPORTING_ENABLED=true
# Country reporting requires a separate administrator opt-in. Set false to enforce off.
PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED=
PREFLYT_INSTALLATION_REPORTING_URL=

# REQUIRED. ${local ? 'The address you open in your browser.' : 'Your public HTTPS address: no trailing slash, no path.'}
WEB_ORIGIN=${local ? 'http://localhost:8080' : 'https://preflyt.example.com'}

# Super Admin sign-in. The password must be 24 to 128 characters.
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=REPLACE_WITH_24_TO_128_CHARACTERS

# REQUIRED. Two different random values. Create each with: openssl rand -hex 24
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_HEX
DATABASE_APP_PASSWORD=REPLACE_WITH_A_DIFFERENT_RANDOM_HEX

# REQUIRED. Keep copies outside the server. Generate a separate value for each key.
# Create each with: openssl rand -base64 32
CONFIGURATION_ENCRYPTION_KEY=REPLACE_WITH_RANDOM_BASE64
GITHUB_USER_TOKEN_ENCRYPTION_KEY=REPLACE_WITH_A_DIFFERENT_RANDOM_BASE64
AI_PROVIDER_ENCRYPTION_KEY=REPLACE_WITH_A_THIRD_RANDOM_BASE64
${local ? `
# LOCAL TRIAL ONLY. Lets Preflyt run over plain http://localhost.
# Never set these on a deployment other people can reach.
PREFLYT_NODE_ENV=development
PREFLYT_COOKIE_SECURE=false
` : ''}`
writeFileSync(resolve(generated, 'env-local.md'), fence('bash', '.env', envLines(true)))
writeFileSync(resolve(generated, 'env-production.md'), fence('bash', '.env', envLines(false)))
writeFileSync(resolve(out, 'preflyt.env.example'), envLines(false))

// Fail the build if the compose file needs a variable the snippet does not show.
const required = new Set([...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map((m) => m[1]))
const shown = new Set([...envLines(false).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))
const missing = [...required].filter((name) => !shown.has(name))
if (missing.length)
  throw new Error(
    `compose.yaml requires ${missing.join(', ')}, but the .env snippet in scripts/generate-downloads.mjs does not list it. Add it.`
  )

// Standalone backup and restore helpers (the repository copies assume its layout).
for (const script of ['backup.sh', 'restore.sh']) {
  const target = resolve(out, script)
  writeFileSync(target, read(`apps/docs/scripts/templates/${script}`))
  chmodSync(target, 0o755)
}

// Kubernetes bundle.
const staging = mkdtempSync(resolve(tmpdir(), 'preflyt-docs-kubernetes-'))
try {
  for (const folder of ['kubernetes', 'kubernetes-shared-docker-runner']) {
    mkdirSync(resolve(staging, folder))
    // Enumerate the selected source revision, not a newer checkout's manifests.
    const files = sourceRef
      ? execFileSync('git', ['ls-tree', '-r', '--name-only', sourceRef, `deploy/${folder}`], {cwd: repo, encoding: 'utf8'}).trim().split('\n').map(path => path.slice(`deploy/${folder}/`.length))
      : readdirSync(resolve(repo, 'deploy', folder))
    for (const file of files) {
      const content = read(`deploy/${folder}/${file}`).replace(/(ghcr\.io\/lyrisoft\/preflyt-[a-z-]+):development/g, `$1:${imageTag}`)
      writeFileSync(resolve(staging, folder, file), content)
    }
  }
  execFileSync('tar', ['-czf', resolve(out, 'kubernetes.tgz'), '-C', staging, 'kubernetes', 'kubernetes-shared-docker-runner'])
} finally { rmSync(staging, {recursive: true, force: true}) }

writeFileSync(resolve(out, 'native-runner.compose.yaml'), read('docs/deployment/native-runner/application.compose.yaml'))

console.log('Generated:', ['compose.yaml', 'preflyt.env.example', 'backup.sh', 'restore.sh', 'kubernetes.tgz', 'native-runner.compose.yaml', '_generated snippets'].join(', '))
