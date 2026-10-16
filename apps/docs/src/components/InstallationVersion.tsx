import CodeBlock from '@theme/CodeBlock'
import {useDocsVersion} from '@docusaurus/plugin-content-docs/client'
import release from '../../../../release.json'

export function useInstallationVersion() {
  const {version} = useDocsVersion()
  const next = version === 'current'
  return {
    next,
    version: next ? 'next' : version,
    imageTag: next ? release.nextImageTag : `v${version}`,
    prefix: next ? '/next' : version === release.latestStable ? '' : `/${version}`,
  }
}

export function InstallationVersion() {
  const {next, imageTag} = useInstallationVersion()
  return <p>{next
    ? <>These are unreleased <strong>Next</strong> docs. Installation examples use the published development build <code>{imageTag}</code>; it may not contain later unreleased changes. Use v{release.latestStable} documentation for the stable release.</>
    : <>These instructions and downloads are for <strong>Preflyt {imageTag}</strong>. Keep every application image on this version.</>}</p>
}

export function GenerateEnvironment({production = false}: {production?: boolean}) {
  const {imageTag} = useInstallationVersion()
  return <CodeBlock language='bash'>{`cat > .env <<EOF
PREFLYT_VERSION=${imageTag}
WEB_ORIGIN=${production ? 'https://preflyt.example.com' : 'http://localhost:8080'}
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=$(openssl rand -hex 20)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DATABASE_APP_PASSWORD=$(openssl rand -hex 24)
CONFIGURATION_ENCRYPTION_KEY=$(openssl rand -base64 32)
GITHUB_USER_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
AI_PROVIDER_ENCRYPTION_KEY=$(openssl rand -base64 32)${production ? '' : '\nPREFLYT_NODE_ENV=development\nPREFLYT_COOKIE_SECURE=false'}
EOF
chmod 600 .env`}</CodeBlock>
}
