// Offline preparation checks. Passing does not authorize or certify a release.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const required = [
  'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'DCO',
  'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'SUPPORT.md',
  'GOVERNANCE.md', 'CHANGELOG.md', '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml', '.github/pull_request_template.md',
]
for (const path of required) assert((await readFile(path, 'utf8')).trim(), `Missing community file: ${path}`)
assert.match(await readFile('LICENSE', 'utf8'), /Apache License\s+Version 2\.0/)
assert.match(await readFile('DCO', 'utf8'), /Developer Certificate of Origin/)
for (const path of ['SECURITY.md', 'CODE_OF_CONDUCT.md']) assert.match(await readFile(path, 'utf8'), /support@lyrisoft\.tech/)
for (const path of ['package.json', 'apps/api/package.json', 'apps/web/package.json', 'apps/docs/package.json']) assert.equal(JSON.parse(await readFile(path, 'utf8')).license, 'Apache-2.0', path)
assert.match(await readFile('.github/CODEOWNERS', 'utf8'), /^\*\s+@iampeters\s*$/m)
console.info(`Community preparation: ${required.length} required files and Apache/DCO/contact metadata verified`)
