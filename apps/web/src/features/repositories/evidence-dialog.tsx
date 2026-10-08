import { ExternalLink, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type EvidenceFile = { path: string; blobSha: string }

const githubPath = (value: string) =>
  value.split('/').map(encodeURIComponent).join('/')

/** File evidence for one signal or control, pinned to an exact commit. */
export function EvidenceDialog({
  title,
  files,
  repositoryName,
  sourceSha,
  compact = false,
}: {
  title: string
  files: EvidenceFile[]
  repositoryName?: string
  sourceSha?: string
  /** Table cells show "2 files"; the accessible name keeps full context. */
  compact?: boolean
}) {
  const count = `${files.length} evidence file${files.length === 1 ? '' : 's'}`
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          aria-label={`${title}: ${count}`}
          className='-ms-2 h-7 px-2 text-xs text-muted-foreground'
        >
          <FileText aria-hidden='true' />
          {compact
            ? `${files.length} file${files.length === 1 ? '' : 's'}`
            : count}
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title} evidence</DialogTitle>
          <DialogDescription>
            {count}
            {sourceSha ? (
              <>
                {' '}
                at commit <code>{sourceSha.slice(0, 12)}</code>
              </>
            ) : null}
            . Paths are hints from the inspected snapshot, not execution
            results.
          </DialogDescription>
        </DialogHeader>
        <ul className='-mx-6 max-h-[60vh] divide-y overflow-y-auto border-y'>
          {files.map((file) => (
            <li
              key={`${file.path}-${file.blobSha}`}
              className='flex items-center gap-3 px-6 py-2.5 text-sm'
            >
              <FileText
                aria-hidden='true'
                className='size-4 shrink-0 text-muted-foreground'
              />
              {repositoryName && sourceSha ? (
                <a
                  className='inline-flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs break-all underline-offset-4 hover:underline'
                  href={`https://github.com/${githubPath(repositoryName)}/blob/${sourceSha}/${githubPath(file.path)}`}
                  target='_blank'
                  rel='noreferrer'
                >
                  {file.path}
                  <ExternalLink
                    aria-hidden='true'
                    className='size-3 shrink-0 text-muted-foreground'
                  />
                </a>
              ) : (
                <span className='min-w-0 flex-1 font-mono text-xs break-all'>
                  {file.path}
                </span>
              )}
              <code
                className='shrink-0 text-xs text-muted-foreground'
                title={`Blob ${file.blobSha}`}
              >
                {file.blobSha.slice(0, 12)}
              </code>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
