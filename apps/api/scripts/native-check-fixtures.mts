import {fileAnalysisMeasurement,fileAnalysisRules} from '../src/health/health-file-analysis.js'
// Explicit disposable fixtures only. This script cannot select a connected repository or publish GitHub checks.
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
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
import {duplicationMeasurement,coverageMeasurement,coverageFailureReason} from '../src/health/health-measurements.js'
import { nativeCheckOutcome } from '../src/execution/native-result.js'
if (
  process.env.NATIVE_FIXTURE_TOOL &&
  !['node', 'gitleaks', 'semgrep', 'trivy', 'trivy-offline', 'duplication'].includes(
    process.env.NATIVE_FIXTURE_TOOL,
  )
)
  throw new Error('Choose an installed fixture tool')
if (process.env.NATIVE_FIXTURE_IMAGE) {
 assert.ok(process.env.NATIVE_FIXTURE_TOOL, 'An exact candidate image requires one fixture tool')
 assert.match(process.env.NATIVE_FIXTURE_IMAGE, /^sha256:[a-f0-9]{64}$/)
}
const fixtureRuntime = process.env.NATIVE_FIXTURE_RUNTIME ?? 'runc'
if (fixtureRuntime !== 'runc' && fixtureRuntime !== 'runsc' && fixtureRuntime !== 'kata')
  throw new Error('Choose runc, runsc or kata for generated fixtures')
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
const duplicateBlock = 'export function calculate(items) {\n  let total = 0;\n  for (const item of items) {\n    if (item.active) {\n      total += item.price * item.quantity;\n      if (item.discount > 0) {\n        total -= item.price * item.discount;\n      }\n    }\n  }\n  return Math.round(total * 100) / 100;\n}\n'
const fixtures: Array<{
  id: string
  ruleId: NativeRuleId
  tool: string
  files: Record<string, string>
  expected: string
}> = [
  // Health coverage comes from CI. Historical coverage requests must fail closed
  // when the image no longer contains the retired coverage test runner.
  {id:'legacy-coverage-unavailable',ruleId:'tests.coverage',tool:'node',files:{'app.js':'exports.value = 1;\n','app.test.js':'const {test}=require("node:test");test("actual",()=>{});\n'},expected:'INCOMPLETE'},

  {id:'hotspot-seeded',ruleId:'security.hotspots',tool:'semgrep',files:{'app.js':'const digest = crypto.createHash("md5");\n'},expected:'FAIL'},
  {id:'hotspot-clean',ruleId:'security.hotspots',tool:'semgrep',files:{'app.js':'const digest = crypto.createHash("sha256");\n'},expected:'PASS'},

  {id:'duplication-seeded',ruleId:'quality.duplication',tool:'duplication',files:{'first.js':duplicateBlock,'second.js':duplicateBlock},expected:'FAIL'},
  {id:'duplication-clean',ruleId:'quality.duplication',tool:'duplication',files:{'first.js':duplicateBlock},expected:'PASS'},
  {id:'reliability-seeded',ruleId:'quality.reliability',tool:'semgrep',files:{'app.js':'const bad = value === NaN;\n'},expected:'FAIL'},
  {id:'reliability-clean',ruleId:'quality.reliability',tool:'semgrep',files:{'app.js':'const bad = Number.isNaN(value);\n'},expected:'PASS'},
  {id:'maintainability-seeded',ruleId:'quality.maintainability',tool:'semgrep',files:{'app.js':'debugger;\n'},expected:'FAIL'},
  {id:'maintainability-clean',ruleId:'quality.maintainability',tool:'semgrep',files:{'app.js':'export const value = 1;\n'},expected:'PASS'},

  {
    id: 'dependency-vulnerability',
    ruleId: 'security.dependencies',
    tool: 'trivy-offline',
    files: {
      'package-lock.json': JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 2, requires: true,
        packages: { '': { name: 'fixture', version: '1.0.0', dependencies: { lodash: '4.17.19' } }, 'node_modules/lodash': { version: '4.17.19' } },
        dependencies: { lodash: { version: '4.17.19' } } }),
    },
    expected: 'FAIL',
  },
  {
    id: 'dependency-clean',
    ruleId: 'security.dependencies',
    tool: 'trivy-offline',
    files: {
      'package-lock.json': JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 2, requires: true, packages: { '': { name: 'fixture', version: '1.0.0' } }, dependencies: {} }),
    },
    expected: 'PASS',
  },
  {
    id: 'iac-clean',
    ruleId: 'iac.policy',
    tool: 'trivy',
    files: { 'main.tf': 'terraform {\n  required_version = ">= 1.0.0"\n}\n' },
    expected: 'PASS',
  },
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
    id: 'terraform-failure',
    ruleId: 'iac.policy',
    tool: 'trivy',
    files: {
      'main.tf':
        'resource "aws_security_group" "unsafe" {\n  name = "unsafe-fixture"\n  ingress {\n    from_port = 22\n    to_port = 22\n    protocol = "tcp"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\n',
    },
    expected: 'FAIL',
  },
  {
    id: 'python-sast-failure',
    ruleId: 'security.sast',
    tool: 'semgrep',
    files: { 'app.py': 'user_input = input()\nexec(user_input)\n' },
    expected: 'FAIL',
  },
  {
    id: 'python-sast-clean',
    ruleId: 'security.sast',
    tool: 'semgrep',
    files: { 'app.py': 'import json\nvalue = json.loads("{}")\n' },
    expected: 'PASS',
  },
  {
    id: 'lint-failure',
    ruleId: 'lint.required',
    tool: 'semgrep',
    files: { 'app.js': 'function inspect() { debugger; }\n' },
    expected: 'FAIL',
  },
  {
    id: 'lint-clean',
    ruleId: 'lint.required',
    tool: 'semgrep',
    files: { 'app.js': 'function inspect() { return 1; }\n' },
    expected: 'PASS',
  },
  {
    id: 'python-lint-failure',
    ruleId: 'lint.required',
    tool: 'semgrep',
    files: { 'app.py': 'try:\n    inspect()\nexcept:\n    pass\n' },
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
const workspaces: Awaited<ReturnType<typeof createNativeWorkspace>>[] = []
try {
  git(['-c', 'init.templateDir=', 'init', '--bare', '--quiet'])
  for (const fixture of fixtures.filter(
    (f) =>
      (!process.env.NATIVE_FIXTURE_TOOL && f.tool !== 'trivy-offline') ||
      f.tool === process.env.NATIVE_FIXTURE_TOOL,
  )) {
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
    workspaces.push(workspace)
    const image = JSON.parse(
      (
        await dockerCommand([
          'image',
          'inspect',
          process.env.NATIVE_FIXTURE_IMAGE ?? 'preflyt-native-' + fixture.tool + ':fixture',
          '--format',
          '{{json .Id}}',
        ])
      ).toString(),
    ) as string
    assert.match(image, /^sha256:[a-f0-9]{64}$/)
    if (fixture.id === 'test-clean') {
      const delivery = join(workspace.root, 'source-bundle')
      await mkdir(delivery, { mode: 0o755 })
      await writeFile(join(delivery, 'bundle.json'), JSON.stringify(bundle), {
        mode: 0o444,
      })
      let initId: string | undefined
      try {
        initId = (
          await dockerCommand([
            'create',
            '--runtime',
            fixtureRuntime,
            '--network',
            'none',
            '--user',
            '65532:65532',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges=true',
            '--pids-limit',
            '128',
            '--cpus',
            '1',
            '--memory',
            '2g',
            '--memory-swap',
            '2g',
            '--mount',
            `type=bind,source=${delivery},target=/source-bundle,readonly`,
            '--tmpfs',
            '/source-workspace:rw,nosuid,nodev,noexec,size=33554432,mode=1777',
            '--env',
            'PREFLYT_SOURCE_REPOSITORY=' + bundle.repositoryId,
            '--env',
            'PREFLYT_SOURCE_SHA=' + bundle.sourceSha,
            '--env',
            'PREFLYT_SOURCE_HASH=' + bundle.sourceHash,
            '--entrypoint',
            '/usr/local/bin/node',
            image,
            '/opt/preflyt/source-initializer.mjs',
          ])
        )
          .toString()
          .trim()
        assert.match(initId, /^[a-f0-9]{64}$/)
        await dockerCommand(['start', '--attach', initId], { timeoutMs: 60000 })
        assert.equal(
          (await dockerCommand(['wait', initId])).toString().trim(),
          '0',
          'Non-root Kubernetes source initialization must succeed',
        )
        console.log('kubernetes-source-init: PASS')
      } finally {
        if (initId) await dockerCommand(['rm', '--force', initId])
      }
    }
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
      databaseBuiltAt: fixture.tool === 'trivy-offline'
        ? JSON.parse((await dockerCommand(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--entrypoint', '/usr/local/bin/node', image, '-e', "process.stdout.write(require('fs').readFileSync('/opt/preflyt/trivy-cache/db/metadata.json','utf8'))"])).toString()).UpdatedAt
        : null,
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
      fixtureRuntime,
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
        fixtureRuntime,
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
      if (fixture.ruleId === 'quality.duplication') {
        const measurement = duplicationMeasurement(envelope.report, report ? createHash('sha256').update(report).digest('hex') : null)
        assert.ok(measurement && measurement.analyzedLines > 0, 'Measured duplication scope is required')
        assert.equal(measurement.duplicatedLines > 0, fixture.expected === 'FAIL')
      }
      if (fixture.ruleId === 'tests.coverage') {
        const digest = report ? createHash('sha256').update(report).digest('hex') : null
        assert.equal(exit, 2, 'Retired coverage execution must fail closed')
        assert.equal(coverageFailureReason(envelope.report, digest), 'TEST_RUNNER_FAILED')
        assert.equal(coverageMeasurement(envelope.report, digest), undefined)
      }
      const outcome = nativeCheckOutcome(fixture.ruleId, exit, report)
      assert.equal(
        outcome.state,
        fixture.expected,
        fixture.id + ': ' + JSON.stringify(outcome),
      )
      if(fileAnalysisRules.includes(fixture.ruleId)) {
       const measured=fileAnalysisMeasurement(report?.toString('base64'),report?createHash('sha256').update(report).digest('hex'):null)
       assert.ok(measured, 'Expected actual Semgrep file counters')
       assert.ok(measured.candidateFiles>0)
       assert.equal(measured.analyzedFiles,measured.candidateFiles)
       assert.equal(measured.skippedFiles,0)
      }
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
        fixtureRuntime,
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
  for (const workspace of workspaces) await workspace.cleanup()
  await rm(root, { recursive: true, force: true })
}
