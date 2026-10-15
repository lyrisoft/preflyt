import { nativeRunnerReport } from './native-runner-report.js'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { digest } from '../assessments/assessment-digest.js'
import {
  nativeAdapters,
  nativeToolReviews,
  type NativeRuleId,
  type NativeToolReview,
} from './native-plan.js'
import {
  nativeDockerApproval,
  dockerControlsProjection,
} from './native-docker-approval.js'
import { nativeCheckOutcome } from './native-result.js'

export type DockerJobScope = {
  requestId: string
  organizationId: string
  repositoryId: string
  sourceSha: string
  sourceHash: string
  planHash: string
}
export type DockerCommand = (
  args: string[],
  options?: { signal?: AbortSignal; maxBytes?: number; timeoutMs?: number },
) => Promise<Buffer>
export const dockerCommand: DockerCommand = (args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      'docker',
      args,
      {
        encoding: 'buffer',
        maxBuffer: options.maxBytes ?? 65536,
        timeout: options.timeoutMs ?? 15000,
        signal: options.signal,
        // Do not pass SCM, model, cloud or application credentials to the Docker client.
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...(process.env.DOCKER_HOST
            ? { DOCKER_HOST: process.env.DOCKER_HOST }
            : {}),
          ...(process.env.DOCKER_TLS_VERIFY
            ? { DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY }
            : {}),
          ...(process.env.DOCKER_CERT_PATH
            ? { DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH }
            : {}),
        },
      },
      (error, stdout) =>
        error &&
        !(
          args[0] === 'start' &&
          args[1] === '--attach' &&
          typeof error.code === 'number'
        )
          ? reject(
              new Error(
                'Native runner ' +
                  args[0] +
                  ' failed (' +
                  String(error.code) +
                  ')',
              ),
            )
          : resolve(stdout),
    )
  })

export function nativeDockerArgs(
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  tool: NativeToolReview,
  sourcePath: string,
  runtime: 'runsc' | 'kata' | 'runc',
  policy: 'native' | 'health' = 'native',
) {
  if (
    !/^[a-f0-9-]{36}$/.test(scope.requestId) ||
    !/^[-a-zA-Z0-9]{1,80}$/.test(scope.organizationId) ||
    !/^[1-9]\d{0,15}$/.test(scope.repositoryId) ||
    !/^[a-f0-9]{40}$/.test(scope.sourceSha) ||
    ![scope.sourceHash, scope.planHash].every((value) =>
      /^[a-f0-9]{64}$/.test(value),
    ) ||
    !/^\/[a-zA-Z0-9_./-]+$/.test(sourcePath) ||
    !['runsc', 'kata', 'runc'].includes(runtime)
  )
    throw new Error('Invalid native job scope')
  const reviewed = nativeToolReviews(JSON.stringify([tool]), Date.now(), policy)
  if (
    !reviewed ||
    !Object.hasOwn(nativeAdapters, ruleId) ||
    tool.ruleId !== ruleId
  )
    throw new Error('Tool review required')
  const jobId =
    'preflyt-native-' + scope.requestId + '-' + ruleId.replace(/\./g, '-')
  return {
    jobId,
    args: [
      'create',
      '--name',
      jobId,
      '--label',
      'preflyt.native=true',
      '--label',
      'preflyt.scope=' + digest({ scope, ruleId, tool }),
      '--runtime',
      runtime,
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
      '--ulimit',
      'nofile=1024:1024',
      '--ulimit',
      'core=0:0',
      '--log-driver',
      'none',
      '--workdir',
      '/workspace',
      '--mount',
      `type=bind,source=${sourcePath},target=/workspace,readonly`,
      '--tmpfs',
      '/scratch:rw,nosuid,nodev,noexec,size=134217728,mode=1777',
      '--tmpfs',
      `/reports:rw,nosuid,nodev,noexec,size=${policy === 'health' ? 67108864 : 1048576},mode=1777`,
      '--env',
      'HOME=/scratch',
      '--env',
      'TMPDIR=/scratch',
      '--env',
      'SEMGREP_SEND_METRICS=off',
      '--env',
      'SEMGREP_ENABLE_VERSION_CHECK=0',
      '--env',
      'PREFLYT_SOURCE_REPOSITORY=' + scope.repositoryId,
      '--env',
      'PREFLYT_SOURCE_SHA=' + scope.sourceSha,
      '--env',
      'PREFLYT_SOURCE_HASH=' + scope.sourceHash,
      '--entrypoint',
      '/usr/local/bin/node',
      tool.image,
      '/opt/preflyt/runner.mjs',
      ruleId,
    ],
  }
}

/** Verify the effective engine spec before running source, not just the requested CLI flags. */
export function verifyNativeDockerInspection(
  info: any,
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  tool: NativeToolReview,
  sourcePath: string,
  runtime: string,
  policy: 'native' | 'health' = 'native',
) {
  const config = info?.Config,
    host = info?.HostConfig
  const security = new Set(host?.SecurityOpt ?? [])
  const mounts = info?.Mounts ?? []
  const ulimits = host?.Ulimits ?? []
  const env = config?.Env ?? []
  const sourceEnv = {
    PREFLYT_SOURCE_REPOSITORY: scope.repositoryId,
    PREFLYT_SOURCE_SHA: scope.sourceSha,
    PREFLYT_SOURCE_HASH: scope.sourceHash,
  }
  if (
    !Array.isArray(env) ||
    Object.entries(sourceEnv).some(
      ([key, value]) =>
        env
          .filter(
            (v: unknown) => typeof v === 'string' && v.startsWith(key + '='),
          )
          .join(',') !==
        key + '=' + value,
    )
  )
    throw new Error('Native source scope changed')
  if (
    config?.Image !== tool.image ||
    config?.User !== '65532:65532' ||
    config?.WorkingDir !== '/workspace' ||
    JSON.stringify(config?.Entrypoint) !==
      JSON.stringify(['/usr/local/bin/node']) ||
    JSON.stringify(config?.Cmd) !==
      JSON.stringify(['/opt/preflyt/runner.mjs', ruleId]) ||
    config?.Labels?.['preflyt.scope'] !== digest({ scope, ruleId, tool }) ||
    host?.Runtime !== runtime ||
    host?.NetworkMode !== 'none' ||
    host?.ReadonlyRootfs !== true ||
    host?.Privileged !== false ||
    host?.PidsLimit !== 128 ||
    host?.NanoCpus !== 1000000000 ||
    host?.Memory !== 2147483648 ||
    host?.MemorySwap !== 2147483648 ||
    host?.LogConfig?.Type !== 'none' ||
    host?.CapAdd?.length ||
    JSON.stringify(host?.CapDrop) !== JSON.stringify(['ALL']) ||
    !security.has('no-new-privileges=true') ||
    [...security].some(
      (value) => typeof value !== 'string' || value.includes('unconfined'),
    ) ||
    host?.Devices?.length ||
    host?.DeviceRequests?.length ||
    host?.PidMode ||
    host?.IpcMode === 'host' ||
    host?.UTSMode ||
    !ulimits.some(
      (limit: any) =>
        limit.Name === 'nofile' && limit.Soft === 1024 && limit.Hard === 1024,
    ) ||
    !ulimits.some(
      (limit: any) =>
        limit.Name === 'core' && limit.Soft === 0 && limit.Hard === 0,
    ) ||
    mounts.filter((mount: any) => mount.Type === 'bind').length !== 1 ||
    !mounts.some(
      (mount: any) =>
        mount.Type === 'bind' &&
        mount.Source === sourcePath &&
        mount.Destination === '/workspace' &&
        mount.RW === false,
    ) ||
    mounts.some(
      (mount: any) =>
        !['/workspace', '/scratch', '/reports'].includes(mount.Destination),
    ) ||
    Object.keys(host?.Tmpfs ?? {})
      .sort()
      .join(',') !== '/reports,/scratch' ||
    host.Tmpfs['/scratch'] !==
      'rw,nosuid,nodev,noexec,size=134217728,mode=1777' ||
    host.Tmpfs['/reports'] !== `rw,nosuid,nodev,noexec,size=${policy === 'health' ? 67108864 : 1048576},mode=1777`
  )
    throw new Error('Native container controls changed')
}

/** Dedicated runner host only. Never called from the API or integration worker process. */
export async function runNativeDockerCheck(
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  sourcePath: string,
  signal?: AbortSignal,
  command: DockerCommand = dockerCommand,
) {
  const reviewed = nativeDockerApproval(),
    inventory = nativeToolReviews()
  if (
    !reviewed ||
    !inventory ||
    !reviewed.approval.organizationIds.includes(scope.organizationId) ||
    inventory.reviewHash !== reviewed.approval.toolReviewHash
  )
    throw new Error('Independent Docker runner review required')
  const tool = inventory.reviews.find((tool) => tool.ruleId === ruleId)
  if (!tool) throw new Error('Tool review required')
  return runIsolatedDockerCheck(scope, ruleId, tool, sourcePath, {
    runtime: reviewed.approval.runtime,
    approvalHash: reviewed.approvalHash,
    environmentId: reviewed.approval.environmentId,
    verify: async () => {
      const current = nativeDockerApproval(), tools = nativeToolReviews()
      if (current?.approvalHash !== reviewed.approvalHash || tools?.reviewHash !== inventory.reviewHash ||
        digest(dockerControlsProjection(JSON.parse((await command(['info', '--format', '{{json .}}'], { signal })).toString()), reviewed.approval.runtime)) !== reviewed.approval.controlsHash)
        throw new Error('Docker runtime approval changed')
    },
  }, signal, command)
}

/** Common enforced container controls. Health calls this only for package-owned static scanners. */
export async function runIsolatedDockerCheck(
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  tool: NativeToolReview,
  sourcePath: string,
  runtime: { runtime: 'runc' | 'runsc' | 'kata'; approvalHash: string; environmentId: string; verify: () => Promise<void>; policy?: 'health' },
  signal?: AbortSignal,
  command: DockerCommand = dockerCommand,
) {
  const canonical = await realpath(sourcePath)
  if (
    canonical !== sourcePath ||
    !canonical.includes('/preflyt-native-') ||
    !canonical.endsWith('/source')
  )
    throw new Error('Use a verified job workspace')
  const sourceDirectory = await open(
    canonical,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  await sourceDirectory.close()
  const verifyRuntime = runtime.verify
  await verifyRuntime()
  const invocation = nativeDockerArgs(
    scope,
    ruleId,
    tool,
    canonical,
    runtime.runtime,
    runtime.policy ?? 'native',
  )
  const startedAt = new Date().toISOString()
  const deadline = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(300000),
  ])
  let report: Buffer | null = null,
    exitCode: number | null = null,
    reason: string | null = null
  let containerId: string | null = null
  let creationAttempted = false
  try {
    deadline.throwIfAborted()
    creationAttempted = true
    const created = (await command(invocation.args, { signal: deadline }))
      .toString()
      .trim()
    if (!/^[a-f0-9]{64}$/.test(created))
      throw new Error('Invalid native container identity')
    containerId = created
    const info = JSON.parse(
      (
        await command(['inspect', containerId], { signal: deadline })
      ).toString(),
    )[0]
    verifyNativeDockerInspection(
      info,
      scope,
      ruleId,
      tool,
      canonical,
      runtime.runtime,
      runtime.policy,
    )
    await verifyRuntime()
    const output = await command(['start', '--attach', containerId], {
      signal: deadline,
      timeoutMs: 300000,
      maxBytes: runtime.policy === 'health' ? 12 * 1024 * 1024 : 360448,
    })
    const exit = (await command(['wait', containerId], { signal: deadline }))
      .toString()
      .trim()
    if (!/^\d{1,3}$/.test(exit)) throw new Error('Invalid native exit status')
    exitCode = Number(exit)
    report = nativeRunnerReport(output, scope.sourceHash, exitCode, runtime.policy === 'health')
    await verifyRuntime()
  } catch {
    reason = deadline.aborted
      ? 'EXECUTION_CANCELLED_OR_TIMED_OUT'
      : 'EXECUTION_UNAVAILABLE'
  } finally {
    // Cleanup remains independent of the cancelled operation's signal and must be confirmed.
    if (creationAttempted && !containerId) reason = 'CLEANUP_UNCONFIRMED'
    if (containerId)
      await command(['rm', '--force', containerId], { timeoutMs: 15000 }).catch(
        () => {
          reason = 'CLEANUP_UNCONFIRMED'
        },
      )
  }
  const outcome = nativeCheckOutcome(ruleId, exitCode, report, runtime.policy === 'health' ? 'health' : 'ci')
  return {
    ...scope,
    ...outcome,
    ...(reason ? { state: 'INCOMPLETE' as const, reason } : {}),
    jobId: invocation.jobId,
    attemptId: randomUUID(),
    image: tool.image,
    adapterId: nativeAdapters[ruleId].id,
    configHash: tool.configHash,
    toolVersion: tool.toolVersion,
    approvalHash: runtime.approvalHash,
    environmentId: runtime.environmentId,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    cleanupConfirmed: reason !== 'CLEANUP_UNCONFIRMED',
    report: reason ? null : (report?.toString('base64') ?? null),
  }
}
