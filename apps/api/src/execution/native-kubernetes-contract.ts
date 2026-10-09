import { digest } from '../assessments/assessment-digest.js'
import type { NativeApproval } from './native-approval.js'
import type { DockerJobScope } from './native-docker-job.js'
import {
  nativeAdapters,
  nativeToolReviews,
  type NativeRuleId,
  type NativeToolReview,
} from './native-plan.js'
import { verifyNativeSourceBundle } from './native-source.js'

/** Fixed Kubernetes resource contract. No repository-controlled Pod spec, executable or credentials. */
export function nativeKubernetesResources(
  scope: DockerJobScope,
  ruleId: NativeRuleId,
  tool: NativeToolReview,
  approval: NativeApproval,
  source: unknown,
) {
  const bundle = verifyNativeSourceBundle(source)
  if (
    !nativeToolReviews(JSON.stringify([tool])) ||
    tool.ruleId !== ruleId ||
    bundle.repositoryId !== scope.repositoryId ||
    bundle.sourceSha !== scope.sourceSha ||
    bundle.sourceHash !== scope.sourceHash ||
    !approval.organizationIds.includes(scope.organizationId) ||
    !/^[a-f0-9-]{36}$/.test(scope.requestId) ||
    !/^[a-f0-9]{64}$/.test(scope.planHash) ||
    !Object.hasOwn(nativeAdapters, ruleId)
  )
    throw new Error('Invalid Kubernetes job admission')
  const content = JSON.stringify(bundle)
  // A single immutable source object keeps the initial launcher bounded; larger trees stay incomplete.
  if (Buffer.byteLength(content) > 512 * 1024)
    throw new Error('Kubernetes source delivery limit exceeded')
  const scopeHash = digest({ scope, ruleId, tool }),
    name = 'pfn-' + scopeHash.slice(0, 40)
  const labels = {
    'app.kubernetes.io/name': 'preflyt-native-check',
    'preflyt.scope': scopeHash.slice(0, 40),
  }
  const metadata = {
    name,
    namespace: approval.namespace,
    labels,
    annotations: { 'preflyt.scope-hash': scopeHash },
  }
  const securityContext = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
    seccompProfile: { type: 'RuntimeDefault' },
  }
  const resources = {
    requests: { cpu: '1', memory: '2Gi', 'ephemeral-storage': '128Mi' },
    limits: { cpu: '1', memory: '2Gi', 'ephemeral-storage': '2Gi' },
  }
  const env = [
    { name: 'HOME', value: '/scratch' },
    { name: 'TMPDIR', value: '/scratch' },
    { name: 'PREFLYT_SOURCE_REPOSITORY', value: scope.repositoryId },
    { name: 'PREFLYT_SOURCE_SHA', value: scope.sourceSha },
    { name: 'PREFLYT_SOURCE_HASH', value: scope.sourceHash },
  ]
  const base = {
    image: tool.image,
    imagePullPolicy: 'Always',
    securityContext,
    resources,
    env,
  }
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { ...metadata, name: name + '-src' },
    immutable: true,
    data: { 'bundle.json': content },
  }
  const podSpec = {
    runtimeClassName: approval.runtimeClass,
    schedulingGates: [{ name: 'preflyt.io/controller-review' }],
    serviceAccountName: approval.serviceAccount,
    automountServiceAccountToken: false,
    restartPolicy: 'Never',
    hostNetwork: false,
    hostPID: false,
    hostIPC: false,
    enableServiceLinks: false,
    securityContext: {
      runAsNonRoot: true,
      runAsUser: 65532,
      runAsGroup: 65532,
      fsGroup: 65532,
      seccompProfile: { type: 'RuntimeDefault' },
    },
    initContainers: [
      {
        ...base,
        name: 'source',
        command: ['/usr/local/bin/node'],
        args: ['/opt/preflyt/source-initializer.mjs'],
        volumeMounts: [
          {
            name: 'source-bundle',
            mountPath: '/source-bundle',
            readOnly: true,
          },
          { name: 'workspace', mountPath: '/source-workspace' },
        ],
      },
    ],
    containers: [
      {
        ...base,
        name: 'check',
        command: ['/usr/local/bin/node'],
        args: ['/opt/preflyt/runner.mjs', ruleId],
        workingDir: '/workspace',
        volumeMounts: [
          {
            name: 'workspace',
            mountPath: '/workspace',
            subPath: 'tree',
            readOnly: true,
          },
          { name: 'scratch', mountPath: '/scratch' },
          { name: 'reports', mountPath: '/reports' },
        ],
      },
    ],
    volumes: [
      {
        name: 'source-bundle',
        configMap: { name: name + '-src', defaultMode: 292 },
      },
      { name: 'workspace', emptyDir: { medium: 'Memory', sizeLimit: '32Mi' } },
      { name: 'scratch', emptyDir: { medium: 'Memory', sizeLimit: '128Mi' } },
      { name: 'reports', emptyDir: { medium: 'Memory', sizeLimit: '1Mi' } },
    ],
  }
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata,
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 300,
      completions: 1,
      parallelism: 1,
      template: {
        metadata: { labels, annotations: { 'preflyt.scope-hash': scopeHash } },
        spec: podSpec,
      },
    },
  }
  return { name, scopeHash, configMap, job }
}
