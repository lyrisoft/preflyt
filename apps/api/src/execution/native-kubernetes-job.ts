import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { digest } from '../assessments/assessment-digest.js'
import type { DockerJobScope } from './native-docker-job.js'
import type { NativeApproval } from './native-approval.js'
import { checkNativeControls } from './native-controls.js'
import { observeNativeRuntime } from './native-observer.js'
import { nativeRuntimeApproval } from './native-runtime.js'
import {
  nativeToolReviews,
  nativeAdapters,
  type NativeRuleId,
  type NativeToolReview,
} from './native-plan.js'
import { nativeKubernetesResources } from './native-kubernetes-contract.js'
import {
  nativeKubernetesClient,
  type NativeKubernetesClient,
} from './native-kubernetes-client.js'
import { nativeRunnerReport } from './native-runner-report.js'
import { nativeCheckOutcome } from './native-result.js'

function owned(value: any, namespace: string, name: string, scopeHash: string) {
  if (
    !value ||
    value.metadata?.namespace !== namespace ||
    value.metadata?.name !== name ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(value.metadata?.uid ?? '') ||
    value.metadata?.annotations?.['preflyt.scope-hash'] !== scopeHash
  )
    throw new Error('Kubernetes resource ownership changed')
}
/** Verify the admitted effective Pod, including injected containers, mounts and credentials. */
export function verifyNativeKubernetesPod(
  pod: any,
  expected: any,
  scopeHash: string,
  jobUid: string,
  scheduled = false,
) {
  if (
    pod?.metadata?.annotations?.['preflyt.scope-hash'] !== scopeHash ||
    pod.metadata?.namespace !== expected.metadata.namespace ||
    pod.metadata.ownerReferences?.length !== 1 ||
    pod.metadata.ownerReferences[0].uid !== jobUid ||
    pod.metadata.ownerReferences[0].kind !== 'Job' ||
    pod.metadata.ownerReferences[0].name !== expected.metadata.name ||
    pod.metadata.ownerReferences[0].apiVersion !== 'batch/v1' ||
    pod.metadata.labels?.['preflyt.scope'] !== scopeHash.slice(0, 40) ||
    pod.metadata.ownerReferences[0].controller !== true
  )
    throw new Error('Kubernetes Pod ownership changed')
  if (
    !/^[a-z0-9-]{1,63}$/.test(pod.metadata.name ?? '') ||
    !pod.metadata.name.startsWith(expected.metadata.name + '-') ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(pod.metadata.uid ?? '')
  )
    throw new Error('Kubernetes Pod identity changed')
  const actual = pod.spec,
    required = expected.spec.template.spec
  if (
    !actual ||
    actual.ephemeralContainers?.length ||
    actual.imagePullSecrets?.length ||
    actual.hostAliases?.length ||
    actual.dnsConfig ||
    actual.securityContext?.supplementalGroups?.length ||
    actual.containers?.length !== 1 ||
    actual.initContainers?.length !== 1
  )
    throw new Error('Kubernetes Pod controls changed')
  if (
    digest(actual.schedulingGates ?? []) !==
    digest(scheduled ? [] : required.schedulingGates)
  )
    throw new Error('Kubernetes scheduling gate changed')
  if (
    !scheduled &&
    (actual.nodeName ||
      pod.status?.phase === 'Running' ||
      pod.status?.containerStatuses?.length)
  )
    throw new Error('Kubernetes Pod ran before review')
  for (const key of [
    'runtimeClassName',
    'serviceAccountName',
    'automountServiceAccountToken',
    'restartPolicy',
    'hostNetwork',
    'hostPID',
    'hostIPC',
    'enableServiceLinks',
    'securityContext',
    'volumes',
  ])
    if (digest(actual[key]) !== digest(required[key]))
      throw new Error('Kubernetes Pod controls changed')
  for (const kind of ['containers', 'initContainers']) {
    const container = actual[kind][0],
      wanted = required[kind][0]
    if (
      container.envFrom?.length ||
      container.volumeDevices?.length ||
      container.ports?.length ||
      container.lifecycle ||
      container.livenessProbe ||
      container.startupProbe ||
      container.readinessProbe
    )
      throw new Error('Kubernetes container controls changed')
    for (const key of [
      'name',
      'image',
      'imagePullPolicy',
      'command',
      'args',
      'workingDir',
      'securityContext',
      'resources',
      'env',
      'volumeMounts',
    ])
      if (digest(container[key] ?? null) !== digest(wanted[key] ?? null))
        throw new Error('Kubernetes container controls changed')
  }
}
const paths = (namespace: string, name: string, scopeHash: string) => ({
  jobs: '/apis/batch/v1/namespaces/' + namespace + '/jobs',
  source: '/api/v1/namespaces/' + namespace + '/configmaps',
  pods:
    '/api/v1/namespaces/' +
    namespace +
    '/pods?labelSelector=' +
    encodeURIComponent('preflyt.scope=' + scopeHash.slice(0, 40)) +
    '&limit=2',
})
async function pods(
  client: NativeKubernetesClient,
  path: string,
  signal?: AbortSignal,
) {
  const value = await client.json('GET', path, undefined, signal)
  if (
    !Array.isArray(value?.items) ||
    value.items.length > 1 ||
    value.metadata?.continue ||
    value.metadata?._continue
  )
    throw new Error('Kubernetes Pod inventory exceeds bounds')
  return value.items as any[]
}
/** Cleanup is independent of the execution signal and deletes only scope-owned UIDs. */
export async function cleanupNativeKubernetesJob(
  client: NativeKubernetesClient,
  approval: NativeApproval,
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  tool: NativeToolReview,
) {
  const scopeHash = digest({ scope, ruleId, tool }),
    name = 'pfn-' + scopeHash.slice(0, 40),
    path = paths(approval.namespace, name, scopeHash)
  const job = await client.json('GET', path.jobs + '/' + name)
  if (job) {
    owned(job, approval.namespace, name, scopeHash)
    await client.json('DELETE', path.jobs + '/' + name, {
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      propagationPolicy: 'Foreground',
      preconditions: { uid: job.metadata.uid },
    })
  }
  let removed = false
  for (let i = 0; i < 10; i++) {
    if (
      !(await client.json('GET', path.jobs + '/' + name)) &&
      !(await pods(client, path.pods)).length
    ) {
      removed = true
      break
    }
    await delay(200)
  }
  if (!removed) throw new Error('Kubernetes cleanup unconfirmed')
  const source = await client.json('GET', path.source + '/' + name + '-src')
  if (source) {
    owned(source, approval.namespace, name + '-src', scopeHash)
    await client.json('DELETE', path.source + '/' + name + '-src', {
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      preconditions: { uid: source.metadata.uid },
    })
  }
  if (await client.json('GET', path.source + '/' + name + '-src'))
    throw new Error('Kubernetes source cleanup unconfirmed')
}
export async function runNativeKubernetesCheck(
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  source: unknown,
  signal?: AbortSignal,
  injected?: {
    client: NativeKubernetesClient
    observe: typeof observeNativeRuntime
  },
) {
  const reviewed = nativeRuntimeApproval(),
    tools = nativeToolReviews(),
    tool = tools?.reviews.find((t) => t.ruleId === ruleId)
  if (!reviewed || reviewed.backend !== 'kubernetes' || !tool)
    throw new Error('Reviewed Kubernetes runner required')
  const approval = reviewed.approval,
    client = injected?.client ?? (await nativeKubernetesClient(approval))
  const observe = injected?.observe ?? observeNativeRuntime
  const verify = async () => {
    const current = nativeRuntimeApproval()
    if (
      !current ||
      current.backend !== 'kubernetes' ||
      current.approvalHash !== reviewed.approvalHash ||
      nativeToolReviews()?.reviewHash !== tools!.reviewHash ||
      !checkNativeControls(approval, await observe(approval)).verified
    )
      throw new Error('Kubernetes runtime approval changed')
  }
  const resources = nativeKubernetesResources(
      scope,
      ruleId,
      tool,
      approval,
      source,
    ),
    path = paths(approval.namespace, resources.name, resources.scopeHash)
  const startedAt = new Date().toISOString(),
    deadline = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(300000),
    ])
  let report: Buffer | null = null,
    exitCode: number | null = null,
    reason: string | null = null,
    creationAttempted = false
  try {
    deadline.throwIfAborted()
    await verify()
    creationAttempted = true
    const created = await client.json(
      'POST',
      path.source,
      resources.configMap,
      deadline,
    )
    owned(
      created,
      approval.namespace,
      resources.name + '-src',
      resources.scopeHash,
    )
    const sourceObject = await client.json(
      'GET',
      path.source + '/' + resources.name + '-src',
      undefined,
      deadline,
    )
    owned(
      sourceObject,
      approval.namespace,
      resources.name + '-src',
      resources.scopeHash,
    )
    if (
      sourceObject.metadata.uid !== created.metadata.uid ||
      sourceObject.immutable !== true ||
      digest(sourceObject.data) !== digest(resources.configMap.data) ||
      sourceObject.binaryData
    )
      throw new Error('Kubernetes source delivery changed')
    const job = await client.json('POST', path.jobs, resources.job, deadline)
    owned(job, approval.namespace, resources.name, resources.scopeHash)
    let completed = false,
      admittedPodUid: string | null = null
    while (!deadline.aborted) {
      const currentJob = await client.json(
        'GET',
        path.jobs + '/' + resources.name,
        undefined,
        deadline,
      )
      owned(currentJob, approval.namespace, resources.name, resources.scopeHash)
      if (currentJob.metadata.uid !== job.metadata.uid)
        throw new Error('Kubernetes Job changed')
      const inventory = await pods(client, path.pods, deadline)
      if (inventory.length) {
        const pod = inventory[0]
        verifyNativeKubernetesPod(
          pod,
          resources.job,
          resources.scopeHash,
          job.metadata.uid,
          admittedPodUid !== null,
        )
        if (!admittedPodUid) {
          if (
            typeof pod.metadata.resourceVersion !== 'string' ||
            !/^[0-9]{1,30}$/.test(pod.metadata.resourceVersion)
          )
            throw new Error('Kubernetes Pod version unavailable')
          const scheduled = await client.json(
            'PATCH',
            '/api/v1/namespaces/' +
              approval.namespace +
              '/pods/' +
              pod.metadata.name,
            {
              metadata: {
                resourceVersion: pod.metadata.resourceVersion,
                uid: pod.metadata.uid,
              },
              spec: { schedulingGates: [] },
            },
            deadline,
          )
          verifyNativeKubernetesPod(
            scheduled,
            resources.job,
            resources.scopeHash,
            job.metadata.uid,
            true,
          )
          if (scheduled.metadata.uid !== pod.metadata.uid)
            throw new Error('Kubernetes Pod changed')
          admittedPodUid = pod.metadata.uid
          continue
        }
        if (pod.metadata.uid !== admittedPodUid)
          throw new Error('Kubernetes Pod changed')
        const status = pod.status?.containerStatuses?.find(
          (c: any) => c.name === 'check',
        )?.state?.terminated
        if (status) {
          if (
            pod.status?.initContainerStatuses?.length !== 1 ||
            pod.status.initContainerStatuses[0]?.name !== 'source' ||
            pod.status.initContainerStatuses[0]?.state?.terminated?.exitCode !==
              0
          )
            throw new Error('Kubernetes source initialization unverified')
          exitCode = status.exitCode
          const output = await client.logs(
            '/api/v1/namespaces/' +
              approval.namespace +
              '/pods/' +
              pod.metadata.name +
              '/log?container=check&limitBytes=360448',
            deadline,
          )
          report = nativeRunnerReport(output, scope.sourceHash, exitCode!)
          completed = true
          break
        }
      }
      if (
        currentJob.status?.failed ||
        currentJob.status?.conditions?.some(
          (c: any) => c.type === 'Failed' && c.status === 'True',
        )
      )
        throw new Error('Kubernetes Job failed')
      await delay(500, undefined, { signal: deadline })
    }
    if (!completed) throw new Error('Kubernetes Job incomplete')
    await verify()
  } catch {
    reason = deadline.aborted
      ? 'EXECUTION_CANCELLED_OR_TIMED_OUT'
      : 'EXECUTION_UNAVAILABLE'
  } finally {
    if (creationAttempted)
      await cleanupNativeKubernetesJob(
        client,
        approval,
        scope,
        ruleId,
        tool,
      ).catch(() => {
        reason = 'CLEANUP_UNCONFIRMED'
      })
  }
  const outcome = nativeCheckOutcome(ruleId, exitCode, report)
  return {
    ...scope,
    ...outcome,
    ...(reason ? { state: 'INCOMPLETE' as const, reason } : {}),
    jobId: resources.name,
    attemptId: randomUUID(),
    image: tool.image,
    adapterId: nativeAdapters[ruleId].id,
    configHash: tool.configHash,
    toolVersion: tool.toolVersion,
    approvalHash: reviewed.approvalHash,
    environmentId: approval.environmentId,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    cleanupConfirmed: reason !== 'CLEANUP_UNCONFIRMED',
    report: reason ? null : (report?.toString('base64') ?? null),
  }
}
