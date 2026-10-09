import { readFile } from 'node:fs/promises'
import { request as httpsRequest } from 'node:https'
import { digest } from '../assessments/assessment-digest.js'
import type { NativeApproval } from './native-approval.js'
export type NativeKubernetesClient = {
  json(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<any>
  logs(path: string, signal?: AbortSignal): Promise<Buffer>
}
/** Dedicated controller credentials only; no ambient kube context, exec plugin or insecure TLS. */
export async function nativeKubernetesClient(
  approval: NativeApproval,
): Promise<NativeKubernetesClient> {
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
    /[\r\n]/.test(token) ||
    digest({ server, caHash: digest(ca.toString()) }) !== approval.clusterHash
  )
    throw new Error('Reviewed cluster connection changed')
  const prefix = '/namespaces/' + approval.namespace + '/'
  const send = (
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    raw: boolean,
  ) =>
    new Promise<any>((resolve, reject) => {
      if (
        !path.startsWith('/api/v1' + prefix) &&
        !path.startsWith('/apis/batch/v1' + prefix)
      ) {
        reject(new Error('Cluster request outside reviewed namespace'))
        return
      }
      if (
        !/^\/(?:api\/v1|apis\/batch\/v1)\/namespaces\/[a-z0-9-]+\/(?:configmaps|jobs|pods)(?:\/[a-z0-9-]+(?:\/log)?)?(?:\?[A-Za-z0-9%=&,._-]+)?$/.test(
          path,
        )
      ) {
        reject(new Error('Invalid cluster resource request'))
        return
      }
      const bytes =
        body === undefined ? undefined : Buffer.from(JSON.stringify(body))
      if (bytes && bytes.length > 1048576) {
        reject(new Error('Cluster request exceeds bounds'))
        return
      }
      const deadline = AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(10000),
      ])
      const req = httpsRequest(
        new URL(path, server),
        {
          method,
          ca,
          rejectUnauthorized: true,
          signal: deadline,
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: raw ? 'text/plain' : 'application/json',
            ...(bytes
              ? {
                  'Content-Type':
                    method === 'PATCH'
                      ? 'application/merge-patch+json'
                      : 'application/json',
                  'Content-Length': bytes.length,
                }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = []
          let size = 0
          response.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > (raw ? 360448 : 1048576)) {
              response.destroy(new Error('Cluster response exceeds bounds'))
              return
            }
            chunks.push(chunk)
          })
          response.on('error', () =>
            reject(new Error('Cluster response unavailable')),
          )
          response.on('end', () => {
            if (response.statusCode === 404 && !raw) {
              resolve(null)
              return
            }
            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              reject(
                new Error(
                  'Cluster operation failed (' + response.statusCode + ')',
                ),
              )
              return
            }
            const output = Buffer.concat(chunks)
            if (raw) {
              resolve(output)
              return
            }
            try {
              resolve(JSON.parse(output.toString('utf8')))
            } catch {
              reject(new Error('Invalid cluster response'))
            }
          })
        },
      )
      req.on('error', () => reject(new Error('Cluster request unavailable')))
      req.end(bytes)
    })
  return {
    json: (method, path, body, signal) =>
      send(method, path, body, signal, false),
    logs: (path, signal) => send('GET', path, undefined, signal, true),
  }
}
