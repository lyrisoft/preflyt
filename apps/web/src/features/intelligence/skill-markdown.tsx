import { useEffect, useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { readSkillMarkdown, type SkillDocument } from './skill-markdown-file'

export function SkillUpload({
  disabled,
  label = 'Upload SKILL.md',
  onDocument,
  onError,
}: {
  disabled: boolean
  label?: string
  onDocument: (document: SkillDocument) => void
  onError: (error: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController>(undefined)
  useEffect(() => () => request.current?.abort(), [])
  return (
    <>
      <input
        ref={input}
        type='file'
        accept='.md,text/markdown,text/plain'
        aria-label={`${label} file`}
        className='hidden'
        disabled={disabled || loading}
        onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          const controller = new AbortController()
          request.current = controller
          setLoading(true)
          onError('')
          try {
            const document = await readSkillMarkdown(file, controller.signal)
            if (!controller.signal.aborted) onDocument(document)
          } catch (error) {
            if (!controller.signal.aborted)
              onError(
                error instanceof Error
                  ? error.message
                  : 'Could not read SKILL.md'
              )
          } finally {
            if (!controller.signal.aborted) setLoading(false)
          }
        }}
      />
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={disabled || loading}
        aria-busy={loading}
        onClick={() => input.current?.click()}
      >
        {loading ? (
          <Loader2
            aria-hidden='true'
            className='size-4 animate-spin motion-reduce:animate-none'
          />
        ) : (
          <FileUp aria-hidden='true' className='size-4' />
        )}
        {loading ? 'Reading…' : label}
      </Button>
    </>
  )
}
/** Render instruction text without executing HTML or fetching linked resources. */
export function MarkdownInstructions({ children }: { children: string }) {
  return (
    <div className='space-y-3 text-sm break-words [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5'>
      <Markdown
        skipHtml
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: () => null,
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}
