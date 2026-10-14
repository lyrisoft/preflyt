// Runs a generated, credential-free fixture through the real scanner transport.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { digest } from '../assessments/assessment-digest.js'
import { gitObjectHash, verifyNativeSourceBundle } from '../execution/native-source.js'
import { HealthScannerClient } from './health-scanner-client.js'
import { healthScannerAuthority, healthScannerPlan, healthScannerRules } from './health-scanner-package.js'

const client = new HealthScannerClient()
const organizationId = 'deployment-smoke', repositoryId = '1', sourceSha = 'a'.repeat(40)
// Fixed, nonfunctional fixture with enough character diversity for entropy filters.
const fixtureToken = ['ghp', '0123456789abcdefghijklmnopqrstuvwxyz'].join('_')
// Duplication needs enough analyzed tokens/lines to establish a measurement.
const duplicatedModule = `export function calculateInvoice(items) {
  const totals = [];
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.price);
    const subtotal = quantity * unitPrice;
    const discount = subtotal * 0.05;
    const taxable = subtotal - discount;
    const tax = taxable * 0.1;
    const total = taxable + tax;
    totals.push({ quantity, unitPrice, subtotal, discount, taxable, tax, total });
  }
  const sum = totals.reduce((value, item) => value + item.total, 0);
  return { totals, sum, currency: 'USD', status: 'calculated' };
}
`
const contents = {
  'app.js': `export const exampleToken = ${JSON.stringify(fixtureToken)};\nexport function greet(name) { return 'Hello ' + name; }\n`,
  'main.tf': 'resource "aws_s3_bucket" "fixture" {\n  bucket = "preflyt-deployment-smoke"\n}\n',
  'duplicate-a.js': duplicatedModule,
  'duplicate-b.js': duplicatedModule,
  'package.json': JSON.stringify({ name: 'preflyt-deployment-smoke', version: '1.0.0', dependencies: {} }),
  'package-lock.json': JSON.stringify({ name: 'preflyt-deployment-smoke', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'preflyt-deployment-smoke', version: '1.0.0' } } }),
}
const files = Object.entries(contents).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(([path, content]) => {
  const bytes = Buffer.from(content)
  return { path, mode: '100644' as const, blobSha: gitObjectHash('blob', bytes), sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, content: bytes.toString('base64') }
})
const tree = files.map(file => ({ path: file.path, type: 'blob' as const, mode: file.mode, sha: file.blobSha, size: file.size }))
const treeSha = gitObjectHash('tree', Buffer.concat(tree.map(file => Buffer.concat([Buffer.from('100644 ' + file.path + '\0'), Buffer.from(file.sha, 'hex')]))))
const manifest = { version: 1 as const, repositoryId, sourceSha, treeSha, tree, files: files.map(({ content: _content, ...file }) => file), totalBytes: files.reduce((sum, file) => sum + file.size, 0) }
const source = verifyNativeSourceBundle({ ...manifest, files, sourceHash: digest(manifest) })
const pkg = await client.package(organizationId)
assert.deepEqual([...new Set(pkg.tools.map(tool => tool.ruleId))].sort(), [...healthScannerRules].sort(), 'All eight Health analyzers must be available')
const requestId = randomUUID(), selectionId = 'health:' + requestId
const { planHash, ...plan } = healthScannerPlan(pkg, { organizationId, repositoryId, sourceSha, selectionId, ruleIds: [...healthScannerRules] })
const expected = { organizationId, repositoryId, sourceSha, selectionId, requestId, attemptId: requestId, planHash, plan, sourceHash: source.sourceHash, ruleIds: [...healthScannerRules], approvalHash: healthScannerAuthority(pkg, organizationId).reviewed.approvalHash }
let completed = false
try {
  await client.call('admit', expected, source)
  for (let attempt = 0; attempt < 180; attempt++) {
    const result = await client.call('status', expected)
    if (result.state !== 'COMPLETE') { await setTimeout(5000); continue }
    const receipt = client.verify(pkg, expected, result.signature)
    assert(receipt, 'Scanner receipt must verify against the exact fixture scope')
    assert.equal(result.cleanupConfirmed, true, 'Source cleanup must be confirmed')
    assert.equal(receipt.cancelled, false)
    assert.equal(receipt.checks.length, healthScannerRules.length)
    for (const check of receipt.checks) {
      assert.equal(check.cleanupConfirmed, true, check.ruleId + ': cleanup')
      assert.notEqual(check.state, 'INCOMPLETE', check.ruleId + ': ' + check.reason)
    }
    const secrets = receipt.checks.find(check => check.ruleId === 'secrets.scan')!
    assert.equal(secrets.state, 'FAIL', 'The generated fake token must be detected')
    assert(secrets.findings?.length, 'A redacted finding must survive signed result delivery')
    completed = true
    console.log('Health scanner smoke passed: eight analyzers, generated finding, verified signed result and source cleanup.')
    break
  }
  assert(completed, 'Health scanner smoke timed out')
} finally {
  if (!completed) await client.call('cancel', expected).catch(() => undefined)
}
