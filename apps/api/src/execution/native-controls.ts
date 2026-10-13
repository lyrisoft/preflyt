import { digest } from '../assessments/assessment-digest.js'
import type { NativeApproval } from './native-approval.js'
export type RuntimeObjects = {
  namespace: any
  runtimeClass: any
  networkPolicies: any[]
  quota: any
  limits: any
  serviceAccount: any
}
function quantity(value: unknown): number {
  if (typeof value !== 'string') return NaN
  const match = /^(\d+(?:\.\d+)?)(m|Ki|Mi|Gi|Ti)?$/.exec(value)
  if (!match) return NaN
  return (
    Number(match[1]) *
    ({ m: 0.001, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 }[
      match[2] ?? ''
    ] ?? 1)
  )
}
const bounded = (value: unknown, max: number) =>
  quantity(value) > 0 && quantity(value) <= max
/** Strip status and volatile metadata, but bind security-relevant spec changes to the review. */
export function nativeControlsProjection(objects: RuntimeObjects) {
  const resource = (v: any) => ({
    apiVersion: v.apiVersion,
    kind: v.kind,
    metadata: {
      name: v.metadata?.name,
      namespace: v.metadata?.namespace,
      uid: v.metadata?.uid,
    },
    spec: v.spec,
  })
  return {
    namespace: {
      name: objects.namespace.metadata?.name,
      uid: objects.namespace.metadata?.uid,
      labels: objects.namespace.metadata?.labels,
    },
    runtimeClass: {
      ...resource(objects.runtimeClass),
      handler: objects.runtimeClass.handler,
      scheduling: objects.runtimeClass.scheduling,
      overhead: objects.runtimeClass.overhead,
    },
    networkPolicies: objects.networkPolicies
      .map(resource)
      .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
    quota: resource(objects.quota),
    limits: resource(objects.limits),
    serviceAccount: {
      ...resource(objects.serviceAccount),
      automountServiceAccountToken:
        objects.serviceAccount.automountServiceAccountToken,
      secrets: objects.serviceAccount.secrets ?? [],
      imagePullSecrets: objects.serviceAccount.imagePullSecrets ?? [],
    },
  }
}
export function checkNativeControls(
  approval: NativeApproval,
  objects: RuntimeObjects,
) {
  const failed: string[] = []
  const labels = objects.namespace.metadata?.labels ?? {}
  if (
    objects.namespace.metadata?.name !== approval.namespace ||
    objects.namespace.metadata?.uid !== approval.namespaceUid ||
    objects.namespace.status?.phase !== 'Active'
  )
    failed.push('Namespace identity')
  if (
    labels['pod-security.kubernetes.io/enforce'] !== 'restricted' ||
    !/^v1\.\d+$/.test(
      labels['pod-security.kubernetes.io/enforce-version'] ?? '',
    )
  )
    failed.push('Restricted pod admission')
  if (
    objects.runtimeClass.metadata?.name !== approval.runtimeClass ||
    objects.runtimeClass.handler !== approval.runtimeHandler ||
    !objects.runtimeClass.scheduling?.nodeSelector ||
    Object.keys(objects.runtimeClass.scheduling.nodeSelector).length === 0
  )
    failed.push('Dedicated isolated runtime')
  // Kubernetes policies are additive. The initial closed-network profile permits no extra policies.
  const deny = objects.networkPolicies[0]
  if (
    objects.networkPolicies.length !== 1 ||
    deny?.metadata?.name !== approval.networkPolicy ||
    deny?.metadata?.namespace !== approval.namespace ||
    JSON.stringify(deny?.spec?.podSelector) !== '{}' ||
    deny?.spec?.ingress?.length ||
    deny?.spec?.egress?.length ||
    ![...(deny?.spec?.policyTypes ?? [])]
      .sort()
      .every((p, i) => p === ['Egress', 'Ingress'][i]) ||
    deny?.spec?.policyTypes?.length !== 2
  )
    failed.push('Default-deny network policy')
  for (const [resource, name] of [
    [objects.quota, approval.resourceQuota],
    [objects.limits, approval.limitRange],
    [objects.serviceAccount, approval.serviceAccount],
  ] as const)
    if (
      resource.metadata?.name !== name ||
      resource.metadata?.namespace !== approval.namespace
    )
      failed.push('Security resource identity')
  const hard = objects.quota.spec?.hard ?? {}
  if (
    !Number.isInteger(quantity(hard.pods)) ||
    !bounded(hard.pods, 20) ||
    !['requests.cpu', 'limits.cpu'].every((key) => bounded(hard[key], 32)) ||
    !['requests.memory', 'limits.memory'].every((key) =>
      bounded(hard[key], 64 * 1024 ** 3),
    ) ||
    !bounded(hard['requests.storage'], 200 * 1024 ** 3) ||
    !['requests.ephemeral-storage', 'limits.ephemeral-storage'].every((key) =>
      bounded(hard[key], 100 * 1024 ** 3),
    )
  )
    failed.push('Resource quotas')
  const container = objects.limits.spec?.limits?.find(
    (limit: any) => limit.type === 'Container',
  )
  if (
    !container ||
    !Object.entries({
      cpu: 4,
      memory: 8 * 1024 ** 3,
      'ephemeral-storage': 4 * 1024 ** 3,
    }).every(
      ([key, max]) =>
        bounded(container.max?.[key], max) &&
        bounded(container.default?.[key], quantity(container.max?.[key])) &&
        bounded(
          container.defaultRequest?.[key],
          quantity(container.default?.[key]),
        ),
    )
  )
    failed.push('Per-container limits')
  if (
    objects.serviceAccount.automountServiceAccountToken !== false ||
    objects.serviceAccount.secrets?.length ||
    objects.serviceAccount.imagePullSecrets?.length
  )
    failed.push('Credential-free sandbox identity')
  if (digest(nativeControlsProjection(objects)) !== approval.controlsHash)
    failed.push('Reviewed control configuration')
  return {
    verified: failed.length === 0,
    failed,
    controlsHash: digest(nativeControlsProjection(objects)),
  }
}
