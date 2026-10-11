// Fails when a variable in the repository's .env.example is missing from the
// configuration reference, so the documentation cannot silently drift.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../../', import.meta.url)
const template = readFileSync(new URL('.env.example', root), 'utf8')
const page = readFileSync(
  fileURLToPath(new URL('../docs/self-hosting/configuration.md', import.meta.url)),
  'utf8'
)

const variables = [...template.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1])
const missing = variables.filter((name) => !page.includes(`\`${name}\``))

if (missing.length) {
  console.error(
    `configuration.md does not document: ${missing.join(', ')}\n` +
      'Add each variable to the reference tables.'
  )
  process.exit(1)
}
console.log(`All ${variables.length} variables in .env.example are documented.`)
