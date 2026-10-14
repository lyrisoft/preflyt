import {cleanupHealthTests} from '../health/health-test-job.js'
import { fileAnalysisErrors, fileAnalysisMeasurement, fileAnalysisRules, fileAnalysisFailureReason } from '../health/health-file-analysis.js'
import {fitHealthReceipt} from '../health/health-receipt-budget.js'
import { healthTestResults, duplicationMeasurement, coverageMeasurement, coverageFailureReason } from '../health/health-measurements.js'
import { validateHealthFindingLocations } from '../health/health-finding-locations.js'
import { healthReceiptFindings } from '../health/health-findings.js'
import { constants } from 'node:fs'
import {
  mkdir,
  lstat,
  open,
  rename,
  readdir,
  chmod,
  rm,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
import { nativeAdmission } from './native-admission.js'
import { nativeAdapters, type NativeRuleId, type NativeToolReview } from './native-plan.js'
import { createNativeWorkspace } from './native-workspace.js'
import { verifyNativeSourceBundle } from './native-source.js'
import {
  dockerCommand,
  runNativeDockerCheck,
  type DockerJobScope,
} from './native-docker-job.js'
import {
  nativeReceiptSummary,
  signNativeReceipt,
  type NativeReceipt,
  type NativeReceiptCheck,
  type NativeReceiptExpected,
} from './native-receipt.js'
export type NativeJobRunner = (
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  sourcePath: string,
  signal?: AbortSignal,
  source?: unknown,
  plan?: unknown,
) => ReturnType<typeof runNativeDockerCheck>
export type JobRecord = {
  expected: NativeReceiptExpected
  scopeHash: string
  state: 'PREPARING' | 'RUNNING' | 'COMPLETE'
  startedAt: string
  workspaceRoot: string | null
  cleanupPending?: boolean
  signature?: string
}
type NativeJobAdmission = (expected: NativeReceiptExpected) => {
  reviewed: { backend: 'docker' | 'kubernetes'; approvalHash: string; approval: {
    environmentId: string; controlsHash: string; controllerPublicKey: string
  } }
  tools: { reviews: NativeToolReview[]; reviewHash: string }
  rules: NativeRuleId[]
}
const uuid = (v: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    v,
  )
/** Dedicated controller only. Private journal stores admission and redacted signed results, never source or raw reports. */
export class NativeControllerJobs {
  private active?: { id: string; abort: AbortController; done: Promise<void> }
  private ready = false
  private admitting = false
  constructor(
    private directory: string,
    private runner: NativeJobRunner = (scope, ruleId, path, signal) =>
      runNativeDockerCheck(scope, ruleId, path, signal),
    private recover?: (expected: NativeReceiptExpected) => Promise<void>,
    private backend: 'docker' | 'kubernetes' = 'docker',
    private admission: NativeJobAdmission = nativeAdmission,
  ) {}
  get available() {
    return this.ready
  }
  get idle() { return this.ready && !this.active && !this.admitting }
  /** Health receipts are already durable in the application; never prune live jobs or source. */
  async pruneHealthJournals(now = Date.now()) {
    if (!this.idle) return
    for (const id of await readdir(this.directory)) {
      if (!uuid(id)) throw new Error('Unexpected controller journal entry')
      const record = await this.read(id)
      if (record.expected.selectionId.startsWith('health:') && record.state === 'COMPLETE' &&
          !record.cleanupPending && !record.workspaceRoot && now - Date.parse(record.startedAt) > 7 * 86400000)
        await rm(this.path(id), { recursive: true })
    }
  }
  private path(id: string) {
    if (!uuid(id)) throw new Error('Invalid attempt')
    return join(this.directory, id)
  }
  private async read(id: string): Promise<JobRecord> {
    const directory = this.path(id),
      info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Unsafe job journal')
    const handle = await open(
      join(directory, 'state.json'),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
    try {
      const stat = await handle.stat()
      if (
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new Error('Unsafe journal permissions')
      if (stat.size > 8 * 1024 * 1024 + 65536) throw new Error('Job journal exceeds bounds')
      const value = JSON.parse(await handle.readFile('utf8')) as JobRecord
      if (!value.expected?.selectionId.startsWith('health:') && stat.size > 65536) throw new Error('Job journal exceeds bounds')
      if (
        value.expected?.attemptId !== id ||
        digest(value.expected) !== value.scopeHash
      )
        throw new Error('Job journal changed')
      return value
    } finally {
      await handle.close()
    }
  }
  private async write(value: JobRecord) {
    const directory = this.path(value.expected.attemptId),
      temp = join(directory, randomUUID() + '.tmp')
    const handle = await open(temp, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(value))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, join(directory, 'state.json'))
    const folder = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY,
    )
    try {
      await folder.sync()
    } finally {
      await folder.close()
    }
  }
  private scope(expected: NativeReceiptExpected): DockerJobScope {
    const {
      requestId,
      organizationId,
      repositoryId,
      sourceSha,
      sourceHash,
      planHash,
    } = expected
    return {
      requestId,
      organizationId,
      repositoryId,
      sourceSha,
      sourceHash,
      planHash,
    }
  }
  private checks(
    expected: NativeReceiptExpected,
    reason: string,
    cleanupConfirmed: boolean,
  ): NativeReceiptCheck[] {
    const { tools, rules } = this.admission(expected)
    return rules.map((ruleId) => {
      const tool = tools.reviews.find((t) => t.ruleId === ruleId)!,
        adapter = nativeAdapters[ruleId]
      return {
        ruleId,
        state: 'INCOMPLETE',
        reason,
        reportHash: null,
        summary: null,
        adapterId: adapter.id,
        image: tool.image,
        toolVersion: tool.toolVersion,
        configHash: tool.configHash,
        commandHash: digest(adapter),
        exitCode: null,
        cleanupConfirmed,
        coverage: 'PARTIAL',
      }
    })
  }
  private async finish(
    record: JobRecord,
    checks: NativeReceiptCheck[],
    cancelled: boolean,
  ) {
    const { reviewed, tools } = this.admission(record.expected)
    const { plan, ruleIds, ...scope } = record.expected
    const value: NativeReceipt = {
      ...scope,
      version: 1,
      environmentId: reviewed.approval.environmentId,
      controlsHash: reviewed.approval.controlsHash,
      toolReviewHash: tools.reviewHash,
      startedAt: record.startedAt,
      finishedAt: new Date().toISOString(),
      cancelled,
      checks,
    }
    record.signature = signNativeReceipt(
      fitHealthReceipt(value),
      process.env.NATIVE_CONTROLLER_SIGNING_KEY ?? '',
      reviewed.approval.controllerPublicKey,
    )
    record.state = 'COMPLETE'
    record.cleanupPending = checks.some((c) => !c.cleanupConfirmed)
    await this.write(record)
  }
  private async removeWorkspace(record: JobRecord) {
    const root = record.workspaceRoot
    if (!root) return
    const parent = this.path(record.expected.attemptId)
    if (
      resolve(root) !== root ||
      !root.startsWith(parent + '/preflyt-native-') ||
      root.slice(parent.length + 1).includes('/')
    )
      throw new Error('Unsafe workspace identity')
    // Only directories under this owned attempt; symlinks are never traversed.
    const visit = async (path: string) => {
      const info = await lstat(path)
      if (info.isSymbolicLink()) return
      if (info.isDirectory()) {
        await chmod(path, 0o700)
        for (const name of await readdir(path)) await visit(join(path, name))
      }
    }
    await visit(root).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    await rm(root, { recursive: true, force: true })
    record.workspaceRoot = null
  }
  async initialize() {
    if (resolve(this.directory) !== this.directory)
      throw new Error('Use an absolute private controller journal directory')
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const info = await lstat(this.directory)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())
    )
      throw new Error('Use an owned private controller journal directory')
    const ids = await readdir(this.directory)
    if (ids.length > 1000)
      throw new Error('Controller journal retention limit reached')
    for (const id of ids) {
      if (!uuid(id)) throw new Error('Unexpected controller journal entry')
      const record = await this.read(id)
      if (
        record.state === 'COMPLETE' &&
        !record.cleanupPending &&
        !record.workspaceRoot
      )
        continue
      // Restart never reruns code. Remove only a deterministic name with our exact scope+tool label.
      const plan = record.expected.plan as any
      if (
        !plan ||
        digest(plan) !== record.expected.planHash ||
        !Array.isArray(record.expected.ruleIds)
      )
        throw new Error('Recovery admission changed')
      for (const id of record.expected.ruleIds) {
        if (!Object.hasOwn(nativeAdapters, id))
          throw new Error('Recovery adapter changed')
      }
      if (this.recover) await this.recover(record.expected)
      else {
        for (const ruleId of record.expected.ruleIds as NativeRuleId[]) {
          const name =
            'preflyt-native-' +
            record.expected.requestId +
            '-' +
            ruleId.replace(/\./g, '-')
          const matches = (
            await dockerCommand([
              'ps',
              '-a',
              '--filter',
              'name=^/' + name + '$',
              '--format',
              '{{.ID}}',
            ])
          )
            .toString()
            .trim()
          if (!matches) continue
          const container = JSON.parse(
            (await dockerCommand(['inspect', name])).toString(),
          )[0]
          const step = plan.steps.find((s: any) => s.ruleId === ruleId)
          if (!step) throw new Error('Recovery tool changed')
          const tool = {
            ruleId,
            image: step.image,
            toolVersion: step.toolVersion,
            license: step.license,
            configHash: step.configHash,
            reviewDigest: step.reviewDigest,
            expiresAt: step.reviewExpiresAt,
            databaseBuiltAt: step.databaseBuiltAt,
          }
          if (
            !/^[a-f0-9]{64}$/.test(container?.Id) ||
            container?.Config?.Labels?.['preflyt.scope'] !==
              digest({ scope: this.scope(record.expected), ruleId, tool })
          )
            throw new Error('Container cleanup ownership could not be verified')
          await dockerCommand(['rm', '--force', container.Id])
        }
      }
      if (record.expected.selectionId.startsWith('health:') && plan.testSettings && record.expected.ruleIds.includes('tests.coverage')) {
        const step=plan.steps.find((s:any)=>s.ruleId==='tests.coverage')
        await cleanupHealthTests(this.scope(record.expected),{ruleId:'tests.coverage',image:step.image,toolVersion:step.toolVersion,license:step.license,configHash:step.configHash,reviewDigest:step.reviewDigest,expiresAt:step.reviewExpiresAt,databaseBuiltAt:step.databaseBuiltAt},dockerCommand)
      }
      if (!record.workspaceRoot) {
        for (const name of await readdir(this.path(id)))
          if (name.startsWith('preflyt-native-')) {
            record.workspaceRoot = join(this.path(id), name)
            await this.removeWorkspace(record)
          }
      }
      await this.removeWorkspace(record)
      if (record.state === 'COMPLETE') {
        record.cleanupPending = false
        await this.write(record)
      } else {
        try {
          await this.finish(
            record,
            this.checks(record.expected, 'CONTROLLER_RESTARTED', true),
            true,
          )
        } catch {
          record.state = 'COMPLETE'
          record.cleanupPending = false
          delete record.signature
          await this.write(record)
        }
      }
    }
    this.ready = true
  }
  async call(
    action: 'admit' | 'status' | 'cancel',
    expected: NativeReceiptExpected,
    source?: unknown,
  ) {
    if (!this.ready || !expected || !uuid(expected.attemptId))
      throw new Error('Controller unavailable')
    const hash = digest(expected)
    if (action !== 'admit') {
      const record = await this.read(expected.attemptId)
      if (record.scopeHash !== hash) throw new Error('Attempt scope changed')
      if (action === 'cancel' && this.active?.id === expected.attemptId)
        this.active.abort.abort()
      return {
        state: record.state,
        ...(record.expected.selectionId.startsWith('health:') ? {cleanupConfirmed: record.state === 'COMPLETE' && !record.cleanupPending && !record.workspaceRoot} : {}),
        ...(record.signature ? { signature: record.signature } : {}),
      }
    }
    if (this.admitting)
      throw new Error('Controller admission is already in progress')
    this.admitting = true
    try {
      return await this.admit(expected, source)
    } finally {
      this.admitting = false
    }
  }
  private async admit(expected: NativeReceiptExpected, source: unknown) {
    const hash = digest(expected)
    const { reviewed } = this.admission(expected)
    if (
      reviewed.backend !== this.backend ||
      (this.backend === 'kubernetes' && !this.recover)
    )
      throw new Error('Matching runner review required')
    try {
      const existing = await this.read(expected.attemptId)
      if (existing.scopeHash !== hash) throw new Error('Attempt scope changed')
      return {
        state: existing.state,
        ...(existing.signature ? { signature: existing.signature } : {}),
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') throw error
    }
    if (this.active || (await readdir(this.directory)).length >= 1000)
      throw new Error('Controller capacity reached')
    const bundle = verifyNativeSourceBundle(source)
    if (
      bundle.repositoryId !== expected.repositoryId ||
      bundle.sourceSha !== expected.sourceSha ||
      bundle.sourceHash !== expected.sourceHash
    )
      throw new Error('Source does not match admission')
    await mkdir(this.path(expected.attemptId), { mode: 0o700 })
    const record: JobRecord = {
      expected,
      scopeHash: hash,
      state: 'PREPARING',
      startedAt: new Date().toISOString(),
      workspaceRoot: null,
    }
    await this.write(record)
    const abort = new AbortController()
    const done = this.execute(
      record,
      bundle,
      AbortSignal.any([abort.signal, AbortSignal.timeout(1800000)]),
    ).finally(() => {
      this.active = undefined
    })
    this.active = { id: expected.attemptId, abort, done }
    // Errors retain the journal for restart cleanup; no false success is returned.
    void done.catch((error) => {
      const code = typeof error?.code === 'string' && /^[A-Z_]{2,40}$/.test(error.code) ? error.code : 'JOB_EXECUTION_FAILED'
      console.error(JSON.stringify({ event: 'health.scanner.job_failed', assessmentId: expected.requestId, reason: code }))
      this.ready = false
    })
    return { state: 'PREPARING' }
  }
  private async execute(
    record: JobRecord,
    bundle: ReturnType<typeof verifyNativeSourceBundle>,
    signal: AbortSignal,
  ) {
    let checks = this.checks(record.expected, 'EXECUTION_CANCELLED', true)
    const workspace = await createNativeWorkspace(
      this.path(record.expected.attemptId),
      bundle,
      signal,
    )
    record.workspaceRoot = workspace.root
    record.state = 'RUNNING'
    await this.write(record)
    let cleanup = true
    try {
      for (let i = 0; i < checks.length; i++) {
        if (signal.aborted) break
        this.admission(record.expected)
        const ruleId = checks[i].ruleId as NativeRuleId
        const result = await this.runner(
          this.scope(record.expected),
          ruleId,
          workspace.workspace,
          signal,
          bundle,
          record.expected.plan,
        )
        const safe = {
          ruleId,
          state: result.state,
          reason: result.reason,
          reportHash: result.reportHash,
          summary: nativeReceiptSummary(result.summary),
          adapterId: result.adapterId,
          image: result.image,
          toolVersion: result.toolVersion,
          configHash: result.configHash,
          commandHash: digest(nativeAdapters[ruleId]),
          exitCode: result.exitCode,
          cleanupConfirmed: result.cleanupConfirmed,
          // Current Node/SAST/SCA/IaC adapters do not yet establish complete repository-wide rule coverage.
          coverage: (ruleId === 'secrets.scan' ? 'FULL_RULE' : 'PARTIAL') as
            'FULL_RULE' | 'PARTIAL',
        }
        const projectedFindings = record.expected.selectionId.startsWith('health:') ? healthReceiptFindings(result.report, result.reportHash, ruleId === 'secrets.scan', ruleId === 'quality.reliability' ? 'reliability' : ruleId === 'quality.maintainability' ? 'maintainability' : ruleId === 'quality.duplication' ? 'duplication' : ruleId === 'security.hotspots' ? 'hotspot' : 'security') : undefined
        const located = validateHealthFindingLocations(projectedFindings, bundle)
        const findings = located.findings
        if (located.rejected) { safe.state = 'INCOMPLETE'; safe.reason = 'SOURCE_LOCATION_INVALID' }
        const fileAnalysis = record.expected.selectionId.startsWith('health:') && fileAnalysisRules.includes(ruleId) ? fileAnalysisMeasurement(result.report,result.reportHash) : undefined
        const measurement = record.expected.selectionId.startsWith('health:') ? ruleId === 'quality.duplication' ? duplicationMeasurement(result.report,result.reportHash) : ruleId === 'tests.coverage' ? coverageMeasurement(result.report,result.reportHash) : undefined : undefined
        const fileFailure = record.expected.selectionId.startsWith('health:') && fileAnalysisRules.includes(ruleId) ? fileAnalysisFailureReason(result.report,result.reportHash) : undefined
        if(fileFailure) {safe.state='INCOMPLETE';safe.reason=fileFailure}
        if(fileAnalysis && (!fileAnalysis.candidateFiles || !fileAnalysis.analyzedFiles)) {safe.state='INCOMPLETE';safe.reason='FILE_ANALYSIS_SCOPE_EMPTY'}
        if(ruleId === 'quality.duplication' && safe.state!=='INCOMPLETE' && (!measurement || measurement.analyzedLines===0)) {safe.state='INCOMPLETE';safe.reason='DUPLICATION_SCOPE_UNAVAILABLE'}
        if(ruleId === 'tests.coverage' && (!measurement || measurement.kind!=='coverage')) {safe.state='INCOMPLETE';safe.reason=coverageFailureReason(result.report,result.reportHash)??'COVERAGE_UNAVAILABLE'}
        const scanErrors = record.expected.selectionId.startsWith('health:') && (fileAnalysisRules.includes(ruleId) || ruleId==='quality.duplication') ? fileAnalysisErrors(result.report,result.reportHash) : undefined
        const testResults=ruleId==='tests.coverage'&&record.expected.selectionId.startsWith('health:')?healthTestResults(result.report,result.reportHash):undefined
        checks[i] = { ...safe, ...(testResults?{testResults}:{}), ...(scanErrors ? {scanErrors} : {}), ...(fileAnalysis ? {fileAnalysis} : {}), ...(measurement ? {measurement} : {}), ...(findings === undefined ? {} : { findings }) }
        if (!result.cleanupConfirmed) {
          cleanup = false
          break
        }
      }
    } catch {
      checks = checks.map((c) => ({
        ...c,
        state: 'INCOMPLETE',
        reason: 'EXECUTION_UNAVAILABLE',
      }))
    } finally {
      await workspace
        .cleanup()
        .then(() => {
          record.workspaceRoot = null
        })
        .catch(() => {
          cleanup = false
        })
      await this.write(record)
    }
    if (signal.aborted || !cleanup)
      checks = checks.map((c) => ({
        ...c,
        state: 'INCOMPLETE',
        reason: cleanup ? 'EXECUTION_CANCELLED' : 'CLEANUP_UNCONFIRMED',
        cleanupConfirmed: cleanup && c.cleanupConfirmed,
      }))
    try {
      await this.finish(record, checks, signal.aborted)
    } catch {
      record.state = 'COMPLETE'
      record.cleanupPending = !cleanup
      delete record.signature
      await this.write(record)
    }
  }
  async close() {
    this.ready = false
    this.active?.abort.abort()
    await this.active?.done.catch(() => undefined)
  }
}
