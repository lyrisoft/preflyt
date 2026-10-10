import { validateReport } from '../src/assessments/evidence-validation.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { parseArtifact } from '../src/github-events/ci-artifact-parser.js'
const exec = promisify(execFile)
it('reports real successful and failed command execution without exposing logs or using a shell', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'preflyt-command-fixture-'))
  const script = resolve('../../docs/deployment/ci-command-report.mjs')
  try {
    for (const [code, expected] of [
      [0, 'REPORTED_SUCCESS'],
      [1, 'REPORTED_FAILURE'],
    ] as const) {
      const output = resolve(directory, `report-${code}.xml`)
      try {
        await exec(process.execPath, [
          script,
          'types.required',
          output,
          '--',
          process.execPath,
          '-e',
          `console.log('private-output'); process.exit(${code})`,
        ])
      } catch (error: any) {
        expect(error.code).toBe(1)
      }
      const content = await readFile(output, 'utf8')
      expect(content).not.toContain('private-output')
      const sha256 = createHash('sha256').update(content).digest('hex')
      const summary = parseArtifact('junit', content, sha256).summary
      expect(
        validateReport({
          id: 'fixture',
          format: 'junit',
          sha256,
          parserVersion: 1,
          verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
          content: Buffer.from(content),
          summary,
        }).reportedResult,
      ).toBe(expected)
    }
    await expect(
      exec(process.execPath, [
        script,
        'tests.required',
        resolve(directory, 'invalid.xml'),
        '--',
        process.execPath,
        '-e',
        'process.exit(0)',
      ]),
    ).rejects.toMatchObject({ code: 2 })
    await expect(
      exec(process.execPath, [
        script,
        'build.required',
        resolve(directory, 'missing.xml'),
        '--',
        '/nonexistent/preflyt-tool',
      ]),
    ).rejects.toMatchObject({ code: 2 })
    const incomplete = await readFile(resolve(directory, 'missing.xml'), 'utf8')
    const incompleteHash = createHash('sha256').update(incomplete).digest('hex')
    const incompleteSummary = parseArtifact(
      'junit',
      incomplete,
      incompleteHash,
    ).summary
    expect(
      validateReport({
        id: 'missing-command',
        format: 'junit',
        sha256: incompleteHash,
        parserVersion: 1,
        verification: 'ADMIN_ASSOCIATED_UNVERIFIED',
        content: Buffer.from(incomplete),
        summary: incompleteSummary,
      }).executedTests,
    ).toBe(0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
