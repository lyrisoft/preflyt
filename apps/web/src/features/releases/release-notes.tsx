import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function releaseLinkLabel(href: string) {
  const pull = /^https:\/\/github\.com\/lyrisoft\/preflyt\/pull\/(\d+)$/.exec(
    href
  )
  if (pull) return `#${pull[1]}`
  if (href.startsWith('https://github.com/lyrisoft/preflyt/compare/'))
    return 'Compare changes on GitHub'
  if (href === 'https://docs.preflytlabs.com/self-hosting/community-edition')
    return 'Community Edition upgrade guide'
  return href
}

export function ReleaseNotes({ body }: { body: string }) {
  return (
    <div className='release-notes min-w-0 text-sm leading-7 wrap-anywhere [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-6 [&_li]:my-2 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:p-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&>h3:first-child]:mt-0'>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h3>{children}</h3>,
          img: () => null,
          a: ({ href, children }) => {
            if (!href || !/^https?:\/\//.test(href))
              return <span>{children}</span>
            return (
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className='font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary'
              >
                {typeof children === 'string' && children === href
                  ? releaseLinkLabel(href)
                  : children}
              </a>
            )
          },
          table: ({ children }) => (
            <div className='my-4 overflow-x-auto'>
              <table className='w-full border-collapse text-left'>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className='border-b px-3 py-2 font-semibold'>{children}</th>
          ),
          td: ({ children }) => (
            <td className='border-b px-3 py-2'>{children}</td>
          ),
        }}
      >
        {body || 'No release notes were provided.'}
      </Markdown>
    </div>
  )
}
