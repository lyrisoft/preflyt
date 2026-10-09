import { readFile } from 'node:fs/promises'
import {
  KubeConfig,
  CoreV1Api,
  NodeV1Api,
  NetworkingV1Api,
  IsomorphicFetchHttpLibrary,
  type RequestContext,
} from '@kubernetes/client-node'
import { digest } from '../assessments/assessment-digest.js'
import type { NativeApproval } from './native-approval.js'
import type { RuntimeObjects } from './native-controls.js'
/** Explicit dedicated credentials only. Never load default/current kube context or exec plugins. */
export async function observeNativeRuntime(
  approval: NativeApproval,
): Promise<RuntimeObjects> {
  const server = process.env.NATIVE_CLUSTER_SERVER ?? '',
    caPath = process.env.NATIVE_CLUSTER_CA_FILE ?? '',
    tokenPath = process.env.NATIVE_CLUSTER_TOKEN_FILE ?? ''
  const url = new URL(server)
  if (
    url.protocol !== 'https:' ||
    url.origin !== server ||
    url.username ||
    url.password ||
    !caPath ||
    !tokenPath
  )
    throw new Error('Dedicated cluster connection required')
  const ca = await readFile(caPath),
    token = (await readFile(tokenPath, 'utf8')).trim()
  if (
    ca.length > 65536 ||
    !ca.toString().includes('-----BEGIN CERTIFICATE-----') ||
    !token ||
    token.length > 32768 ||
    digest({ server, caHash: digest(ca.toString()) }) !== approval.clusterHash
  )
    throw new Error('Reviewed cluster connection changed')
  const config = new KubeConfig()
  config.loadFromOptions({
    clusters: [
      {
        name: 'native',
        server,
        caData: ca.toString('base64'),
        skipTLSVerify: false,
      },
    ],
    users: [{ name: 'observer', token }],
    contexts: [
      {
        name: 'native',
        cluster: 'native',
        user: 'observer',
        namespace: approval.namespace,
      },
    ],
    currentContext: 'native',
  })
  const core = config.makeApiClient(CoreV1Api),
    node = config.makeApiClient(NodeV1Api),
    network = config.makeApiClient(NetworkingV1Api)
  const transport = new IsomorphicFetchHttpLibrary()
  const opts = {
    httpApi: {
      send(request: RequestContext) {
        request.setSignal(AbortSignal.timeout(10000))
        return transport.send(request)
      },
    },
  }
  const [namespace, runtimeClass, policies, quota, limits, serviceAccount] =
    await Promise.all([
      core.readNamespace({ name: approval.namespace }, opts),
      node.readRuntimeClass({ name: approval.runtimeClass }, opts),
      network.listNamespacedNetworkPolicy(
        { namespace: approval.namespace, limit: 101 },
        opts,
      ),
      core.readNamespacedResourceQuota(
        { namespace: approval.namespace, name: approval.resourceQuota },
        opts,
      ),
      core.readNamespacedLimitRange(
        { namespace: approval.namespace, name: approval.limitRange },
        opts,
      ),
      core.readNamespacedServiceAccount(
        { namespace: approval.namespace, name: approval.serviceAccount },
        opts,
      ),
    ])
  if (policies.metadata?._continue || policies.items.length > 100)
    throw new Error('Network policy inventory exceeds limit')
  return {
    namespace,
    runtimeClass,
    networkPolicies: policies.items,
    quota,
    limits,
    serviceAccount,
  }
}
