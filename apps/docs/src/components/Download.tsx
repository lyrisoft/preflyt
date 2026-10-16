import {useInstallationVersion} from './InstallationVersion'
import CodeBlock from '@theme/CodeBlock'
import Link from '@docusaurus/Link'
import useBaseUrl from '@docusaurus/useBaseUrl'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

/** Link to a generated file in static/downloads, correct under any base URL. */
export function DownloadLink({ file, children }: { file: string; children?: React.ReactNode }) {
  const {version} = useInstallationVersion()
  const href = useBaseUrl(`/downloads/${version}/${file}`)
  return (
    <Link to={href} download>
      {children ?? <code>{file}</code>}
    </Link>
  )
}

/** A copyable command that downloads a generated file from this site. */
export function CurlDownload({ file }: { file: string }) {
  const { siteConfig } = useDocusaurusContext()
  const {version} = useInstallationVersion()
  const path = useBaseUrl(`/downloads/${version}/${file}`)
  return <CodeBlock language="bash">{`curl -fsSLO ${siteConfig.url}${path}`}</CodeBlock>
}
