// Explicit disposable fixtures only. This script cannot select a connected repository or publish GitHub checks.
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import {
  nativeAdapters,
  type NativeRuleId,
} from '../src/execution/native-plan.js'
import {
  nativeDockerArgs,
  dockerCommand,
  verifyNativeDockerInspection,
} from '../src/execution/native-docker-job.js'
import {
  gitObjectHash,
  readPinnedNativeSource,
} from '../src/execution/native-source.js'
import { createNativeWorkspace } from '../src/execution/native-workspace.js'
import { digest } from '../src/assessments/assessment-digest.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
if (process.env.NATIVE_FIXTURE_TOOL && !['node','gitleaks','semgrep','trivy'].includes(process.env.NATIVE_FIXTURE_TOOL)) throw new Error('Choose an installed fixture tool')
const root = await mkdtemp(join(tmpdir(), 'preflyt-p3-fixtures-'))
const git = (args: string[], input?: Buffer | string) =>
  execFileSync('git', args, {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Preflyt fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Preflyt fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim()
const configurations = JSON.parse(
  await readFile(
    new URL(
      '../../../docs/deployment/native-runner/adapters.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
assert.deepEqual(
  configurations,
  nativeAdapters,
  'Image adapter contracts must match the API',
)
const fixtures: Array<{
  id: string
  ruleId: NativeRuleId
  tool: string
  files: Record<string, string>
  expected: string
}> = [
  {
    id: 'secret-failure',
    ruleId: 'secrets.scan',
    tool: 'gitleaks',
    files: {
      'app.js': 'const token = "ghp_xT9dK7vM2pQ8nL5sR4cJ6hB3wF0aY1uE9zI2";\n',
    },
    expected: 'FAIL',
  },
  {
    id: 'secret-clean',
    ruleId: 'secrets.scan',
    tool: 'gitleaks',
    files: { 'app.js': 'export const name = "fixture";\n' },
    expected: 'PASS',
  },
  {
    id: 'sast-failure',
    ruleId: 'security.sast',
    tool: 'semgrep',
    files: { 'app.js': 'eval("danger");\n' },
    expected: 'FAIL',
  },
  {
    id: 'sast-clean',
    ruleId: 'security.sast',
    tool: 'semgrep',
    files: { 'app.js': 'JSON.parse("{}");\n' },
    expected: 'PASS',
  },
  {
    id: 'iac-failure',
    ruleId: 'iac.policy',
    tool: 'trivy',
    files: {
      'pod.yaml':
        'apiVersion: v1\nkind: Pod\nmetadata:\n  name: unsafe-fixture\nspec:\n  hostNetwork: true\n  containers:\n    - name: unsafe\n      image: example.invalid/fixture:latest\n      securityContext:\n        privileged: true\n',
    },
    expected: 'FAIL',
  },
  {
    id: 'test-failure',
    ruleId: 'tests.required',
    tool: 'node',
    files: {
      'fixture.test.js':
        'const {test} = require("node:test"); const assert = require("node:assert/strict"); test("seeded failure",()=>assert.equal(1,2));\n',
    },
    expected: 'FAIL',
  },
  {
    id: 'test-clean',
    ruleId: 'tests.required',
    tool: 'node',
    files: {
      'fixture.test.js':
        'const {test} = require("node:test"); const assert = require("node:assert/strict"); test("seeded pass",()=>assert.equal(1,1));\n',
    },
    expected: 'PASS',
  },
  {
    id: 'zero-tests',
    ruleId: 'tests.required',
    tool: 'node',
    files: { 'app.js': 'exports.value = 1;\n' },
    expected: 'INCOMPLETE',
  },
  {
    id: 'skipped-tests',
    ruleId: 'tests.required',
    tool: 'node',
    files: {
      'fixture.test.js':
        'const {test} = require("node:test"); test("executed",()=>{}); test.skip("missing",()=>{});\n',
    },
    expected: 'INCOMPLETE',
  },
]
const results: unknown[] = []
try {
  git(['-c', 'init.templateDir=', 'init', '--bare', '--quiet'])
  for (const fixture of fixtures.filter(f => !process.env.NATIVE_FIXTURE_TOOL || f.tool === process.env.NATIVE_FIXTURE_TOOL)) {
    const entries = Object.entries(fixture.files)
      .sort()
      .map(([path, text]) => {
        const bytes = Buffer.from(text)
        const sha = git(['hash-object', '-w', '--stdin'], bytes)
        assert.equal(sha, gitObjectHash('blob', bytes))
        return {
          path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha,
          size: bytes.length,
          bytes,
        }
      })
    const tree = git(
      ['mktree'],
      entries.map((file) => `100644 blob ${file.sha}\t${file.path}\n`).join(''),
    )
    const sha = git(['commit-tree', tree, '-m', fixture.id])
    const bundle = await readPinnedNativeSource(
      async <T,>(path: string): Promise<T> => {
        if (path.includes('/commits/')) return { sha, tree: { sha: tree } } as T
        if (path.includes('/trees/'))
          return {
            sha: tree,
            truncated: false,
            tree: entries.map(({ bytes, ...entry }) => entry),
          } as T
        const file = entries.find((file) => path.endsWith(file.sha))!
        return {
          sha: file.sha,
          size: file.size,
          encoding: 'base64',
          content: file.bytes.toString('base64'),
        } as T
      },
      '/repos/fixture/native',
      '1',
      sha,
    )
    const workspace = await createNativeWorkspace(root, bundle)
    const image = JSON.parse(
      (
        await dockerCommand([
          'image',
          'inspect',
          'preflyt-native-' + fixture.tool + ':fixture',
          '--format',
          '{{json .Id}}',
        ])
      ).toString(),
    ) as string
    assert.match(image, /^sha256:[a-f0-9]{64}$/)
    const review = {
      ruleId: fixture.ruleId,
      image: 'docker.io/preflyt/fixture@' + image,
      toolVersion: 'fixture',
      license: nativeAdapters[fixture.ruleId].license,
      configHash: createHash('sha256')
        .update(JSON.stringify(configurations))
        .digest('hex'),
      reviewDigest: 'f'.repeat(64),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      databaseBuiltAt: null,
    }
    const scope = {
      requestId: randomUUID(),
      organizationId: 'preflyt-fixtures',
      repositoryId: '1',
      sourceSha: sha,
      sourceHash: bundle.sourceHash,
      planHash: createHash('sha256')
        .update(JSON.stringify({ fixture: fixture.id, image }))
        .digest('hex'),
    }
    const invocation = nativeDockerArgs(
      scope,
      fixture.ruleId,
      review,
      workspace.workspace,
      'runc',
    )
    // Local content-addressed images are test artifacts, not approved production registry images.
    const effectiveReview = { ...review, image }
    const args = invocation.args.map((arg) =>
      arg === review.image
        ? image
        : arg ===
            'preflyt.scope=' +
              digest({ scope, ruleId: fixture.ruleId, tool: review })
          ? 'preflyt.scope=' +
            digest({ scope, ruleId: fixture.ruleId, tool: effectiveReview })
          : arg,
    )
    const deadline = AbortSignal.timeout(60000)
    let containerId: string | null = null
    try {
      containerId = (await dockerCommand(args, { signal: deadline }))
        .toString()
        .trim()
      assert.match(containerId, /^[a-f0-9]{64}$/)
      const beforeStart = JSON.parse(
        (await dockerCommand(['inspect', containerId])).toString(),
      )[0]
      verifyNativeDockerInspection(
        beforeStart,
        scope,
        fixture.ruleId,
        effectiveReview,
        workspace.workspace,
        'runc',
      )
      const output = await dockerCommand(
        ['start', '--attach', invocation.jobId],
        { signal: deadline, timeoutMs: 60000, maxBytes: 360448 },
      )
      const exit = Number(
        (await dockerCommand(['wait', invocation.jobId])).toString().trim(),
      )
      const envelope = JSON.parse(output.toString())
      assert.equal(envelope.version, 2)
      assert.equal(envelope.sourceHash, bundle.sourceHash)
      assert.equal(envelope.exitCode, exit)
      const report = envelope.report
        ? Buffer.from(envelope.report, 'base64')
        : null
      const outcome = nativeCheckOutcome(fixture.ruleId, exit, report)
      assert.equal(
        outcome.state,
        fixture.expected,
        fixture.id + ': ' + JSON.stringify(outcome),
      )
      if (fixture.id === 'secret-failure')
        assert.ok(
          !report?.includes(
            Buffer.from('ghp_xT9dK7vM2pQ8nL5sR4cJ6hB3wF0aY1uE9zI2'),
          ),
          'Secret reports must be redacted',
        )
      const inspection = JSON.parse(
        (await dockerCommand(['inspect', invocation.jobId])).toString(),
      )[0]
      verifyNativeDockerInspection(
        inspection,
        scope,
        fixture.ruleId,
        { ...review, image },
        workspace.workspace,
        'runc',
      )
      assert.equal(inspection.HostConfig.NetworkMode, 'none')
      assert.equal(inspection.HostConfig.ReadonlyRootfs, true)
      assert.equal(inspection.HostConfig.Privileged, false)
      assert.equal(inspection.Config.User, '65532:65532')
      assert.equal(inspection.HostConfig.PidsLimit, 128)
      assert.ok(
        inspection.Mounts.every(
          (mount: { Destination: string; RW: boolean }) =>
            mount.Destination !== '/var/run/docker.sock' &&
            (mount.Destination !== '/workspace' || !mount.RW),
        ),
      )
      results.push({
        fixture: fixture.id,
        executionClass: 'FIXTURE_SANDBOX',
        sourceSha: sha,
        image,
        ...outcome,
      })
      console.log(`${fixture.id}: ${outcome.state}`)
    } finally {
      if (containerId) await dockerCommand(['rm', '--force', containerId])
      await workspace.cleanup()
    }
  }
  const outputPath = process.env.NATIVE_FIXTURE_RESULTS
  if (outputPath)
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          version: 1,
          executionClass: 'FIXTURE_SANDBOX',
          verifiedAt: new Date().toISOString(),
          results,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    )
  console.log(
    'Disposable fixture checks passed. No connected repository or production runtime was accepted.',
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
