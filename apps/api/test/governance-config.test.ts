import { afterEach, expect, it, vi } from 'vitest'
import { governanceConfiguration } from '../src/github/governance-config.js'
afterEach(() => vi.unstubAllEnvs())
function configure(local: boolean) {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('GITHUB_APP_ID', '4585551')
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'local-secret')
  vi.stubEnv('GITHUB_GOVERNANCE_APP_ID', '9876543')
  vi.stubEnv('GITHUB_GOVERNANCE_PRIVATE_KEY', 'governance-secret')
  vi.stubEnv('GITHUB_GOVERNANCE_INSTALLATION_ID', '153542598')
  vi.stubEnv('GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE', String(local))
}
it('uses separate governance credentials by default', () => {
  configure(false)
  expect(governanceConfiguration('lyrisoft/production')).toMatchObject({
    appId: '9876543',
    localAcceptance: false,
  })
})
it('allows shared credentials only for the explicit development acceptance repository', () => {
  configure(true)
  expect(
    governanceConfiguration('lyrisoft/preflyt-p2-acceptance'),
  ).toMatchObject({ appId: '4585551', localAcceptance: true })
  expect(() => governanceConfiguration('lyrisoft/preflyt')).toThrow(
    'restricted',
  )
  vi.stubEnv('NODE_ENV', 'production')
  expect(() =>
    governanceConfiguration('lyrisoft/preflyt-p2-acceptance'),
  ).toThrow('restricted')
})
it('rejects shared credentials without the local exception', () => {
  configure(false)
  vi.stubEnv('GITHUB_GOVERNANCE_APP_ID', '4585551')
  expect(() =>
    governanceConfiguration('lyrisoft/preflyt-p2-acceptance'),
  ).toThrow('separate')
})
it('fails closed for missing installation credentials', () => {
  configure(true)
  vi.stubEnv('GITHUB_GOVERNANCE_INSTALLATION_ID', '')
  expect(() =>
    governanceConfiguration('lyrisoft/preflyt-p2-acceptance'),
  ).toThrow('Configure')
})
