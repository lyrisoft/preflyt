import { configurationValue } from '../configuration/runtime-configuration.js'
import { ServiceUnavailableException, ForbiddenException } from '@nestjs/common'

/** Separate credentials by default; the local exception cannot target other repositories. */
export function governanceConfiguration(repositoryFullName: string) {
  const local = process.env.GITHUB_GOVERNANCE_LOCAL_ACCEPTANCE === 'true'
  const production = process.env.NODE_ENV === 'production'
  if (
    local &&
    (production ||
      process.env.NODE_ENV !== 'development' ||
      repositoryFullName !== 'lyrisoft/preflyt-p2-acceptance')
  )
    throw new ForbiddenException(
      'The shared App exception is restricted to the local acceptance repository',
    )
  const appId = local
    ? configurationValue('GITHUB_APP_ID')
    : configurationValue('GITHUB_GOVERNANCE_APP_ID')
  const privateKey = local
    ? configurationValue('GITHUB_APP_PRIVATE_KEY')
    : configurationValue('GITHUB_GOVERNANCE_PRIVATE_KEY')
  const installationId = configurationValue('GITHUB_GOVERNANCE_INSTALLATION_ID')
  if (
    !appId ||
    !/^[1-9]\d*$/.test(appId) ||
    !privateKey ||
    !installationId ||
    !/^[1-9]\d*$/.test(installationId)
  )
    throw new ServiceUnavailableException(
      'Configure the governance App and its organization installation before changing rulesets',
    )
  if (!local && appId === configurationValue('GITHUB_APP_ID'))
    throw new ForbiddenException(
      'Production governance requires a separate GitHub App',
    )
  return {
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    installationId: BigInt(installationId),
    localAcceptance: local,
  }
}
