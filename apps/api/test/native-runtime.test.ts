import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
vi.mock('../src/execution/native-approval.js', () => ({
  parseNativeApproval: vi.fn(),
}))
vi.mock('../src/execution/native-docker-approval.js', () => ({
  nativeDockerApproval: vi.fn(),
}))
import { parseNativeApproval } from '../src/execution/native-approval.js'
import { nativeDockerApproval } from '../src/execution/native-docker-approval.js'
import { nativeRuntimeApproval } from '../src/execution/native-runtime.js'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})
describe('deployment runtime selection', () => {
  it('uses the existing Kubernetes option by default', () => {
    vi.stubEnv('NATIVE_RUNTIME_BACKEND', undefined)
    vi.mocked(parseNativeApproval).mockReturnValue(null)
    expect(nativeRuntimeApproval()).toBeNull()
    expect(parseNativeApproval).toHaveBeenCalledOnce()
    expect(nativeDockerApproval).not.toHaveBeenCalled()
  })
  it('does not fall back to Kubernetes after a missing Docker review', () => {
    vi.stubEnv('NATIVE_RUNTIME_BACKEND', 'docker')
    vi.mocked(nativeDockerApproval).mockReturnValue(null)
    expect(nativeRuntimeApproval()).toBeNull()
    expect(nativeDockerApproval).toHaveBeenCalledOnce()
    expect(parseNativeApproval).not.toHaveBeenCalled()
  })
  it('rejects unknown deployment selectors', () => {
    vi.stubEnv('NATIVE_RUNTIME_BACKEND', 'unsafe')
    expect(nativeRuntimeApproval()).toBeNull()
    expect(parseNativeApproval).not.toHaveBeenCalled()
    expect(nativeDockerApproval).not.toHaveBeenCalled()
  })
  it('keeps runtime observation and Docker authority outside API and worker import graphs', () => {
    const source = resolve(process.cwd(), 'src')
    const visited = new Set<string>()
    const visit = (path: string) => {
      if (visited.has(path) || !existsSync(path)) return
      visited.add(path)
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(
        /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
      )) {
        if (match[1].startsWith('.'))
          visit(resolve(dirname(path), match[1].replace(/\.js$/, '.ts')))
      }
    }
    visit(resolve(source, 'main.ts'))
    visit(resolve(source, 'worker.ts'))
    for (const name of [
      'execution-controller.ts',
      'execution/native-controller.ts',
      'execution/native-docker-job.ts',
      'execution/native-observer.ts',
    ])
      expect(visited.has(resolve(source, name)), name).toBe(false)
  })
})
