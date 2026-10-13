import CodeBlock from '@theme/CodeBlock'
import Link from '@docusaurus/Link'
import useBaseUrl from '@docusaurus/useBaseUrl'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

/** Link to a generated file in static/downloads, correct under any base URL. */
export function DownloadLink({ file, children }: { file: string; children?: React.ReactNode }) {
  const href = useBaseUrl(`/downloads/${file}`)
  return (
    <Link to={href} download>
      {children ?? <code>{file}</code>}
    </Link>
  )
}

/** A copyable command that downloads a generated file from this site. */
export function CurlDownload({ file }: { file: string }) {
  const { siteConfig } = useDocusaurusContext()
  const path = useBaseUrl(`/downloads/${file}`)
  return <CodeBlock language="bash">{`curl -fsSLO ${siteConfig.url}${path}`}</CodeBlock>
}
