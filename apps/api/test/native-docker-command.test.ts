import { afterEach, expect, it, vi } from 'vitest'
const exec = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFile: exec }))
import { dockerCommand } from '../src/execution/native-docker-job.js'
afterEach(() => {
  vi.unstubAllEnvs()
  exec.mockReset()
})
it('passes dedicated engine TLS settings but strips application and cloud credentials', async () => {
  vi.stubEnv('DOCKER_HOST', 'tcp://runner.example.invalid:2376')
  vi.stubEnv('DOCKER_TLS_VERIFY', '1')
  vi.stubEnv('DOCKER_CERT_PATH', '/run/docker-tls')
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'fixture-platform-key')
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'fixture-cloud-key')
  exec.mockImplementation((_file, _args, _options, callback) =>
    callback(null, Buffer.from('{}')),
  )
  await dockerCommand(['info'])
  const options = exec.mock.calls[0][2]
  expect(options.env.DOCKER_HOST).toBe('tcp://runner.example.invalid:2376')
  expect(options.env.DOCKER_TLS_VERIFY).toBe('1')
  expect(options.env.DOCKER_CERT_PATH).toBe('/run/docker-tls')
  expect(options.env.GITHUB_APP_PRIVATE_KEY).toBeUndefined()
  expect(options.env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
  expect(Object.keys(options.env).sort()).toEqual([
    'DOCKER_CERT_PATH',
    'DOCKER_HOST',
    'DOCKER_TLS_VERIFY',
    'HOME',
    'PATH',
  ])
})
