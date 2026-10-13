import { parseNativeApproval } from './native-approval.js'
import { nativeDockerApproval } from './native-docker-approval.js'

/** Select the reviewed deployment backend; never fall back after a failed review. */
export function nativeRuntimeApproval() {
  const backend = process.env.NATIVE_RUNTIME_BACKEND ?? 'kubernetes'
  if (backend === 'docker') {
    const reviewed = nativeDockerApproval()
    return reviewed ? { backend: 'docker' as const, ...reviewed } : null
  }
  if (backend === 'kubernetes') {
    const reviewed = parseNativeApproval()
    return reviewed ? { backend: 'kubernetes' as const, ...reviewed } : null
  }
  return null
}
