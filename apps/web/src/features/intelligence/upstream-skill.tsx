import { useState, type FormEvent } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { governanceRequest } from '../repositories/governance-api'
import { MarkdownInstructions } from './skill-markdown'
import type { SkillDocument } from './skill-markdown-file'

export function UpstreamSkill({
  disabled,
  onDocument,
}: {
  disabled: boolean
  onDocument: (skill: SkillDocument) => void
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [inspected, setInspected] = useState<{
      manifest: SkillDocument
      licenseText: string
      sha256: string
    }>(),
    [reviewed, setReviewed] = useState(false),
    [license, setLicense] = useState('')
  async function inspect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fields = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    setInspected(undefined)
    setReviewed(false)
    try {
      setInspected(
        await governanceRequest(
          '/ai/skills/upstream',
          Object.fromEntries(
            ['repository', 'commit', 'path', 'licensePath'].map((key) => [
              key,
              fields.get(key),
            ])
          )
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not inspect skill')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        size='sm'
        variant='outline'
        disabled={disabled}
        onClick={() => {
          setOpen(true)
          setInspected(undefined)
          setError('')
          setReviewed(false)
          setLicense('')
        }}
      >
        <Download className='size-4' />
        Import from GitHub
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className='flex max-h-[85svh] flex-col sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Inspect an upstream skill</DialogTitle>
            <DialogDescription>
              Pin a public GitHub commit and review the instructions and
              license. Importing opens a disabled draft.
            </DialogDescription>
          </DialogHeader>
          <div className='min-h-0 space-y-4 overflow-y-auto'>
            <form onSubmit={inspect} className='grid gap-3 sm:grid-cols-2'>
              {[
                ['repository', 'Repository', 'owner/repository', ''],
                ['commit', 'Commit SHA', 'Full 40-character commit SHA', ''],
                ['path', 'Skill path', 'skills/review/SKILL.md', 'SKILL.md'],
                ['licensePath', 'License path', 'LICENSE', 'LICENSE'],
              ].map(([key, label, placeholder, value]) => (
                <label className='space-y-1 text-sm' key={key}>
                  <span>{label}</span>
                  <Input
                    name={key}
                    required
                    maxLength={key === 'repository' ? 70 : 80}
                    placeholder={placeholder}
                    defaultValue={value}
                    disabled={busy}
                  />
                </label>
              ))}
              <div className='flex justify-end sm:col-span-2'>
                <Button disabled={busy} type='submit'>
                  Inspect files
                </Button>
              </div>
            </form>
            {error && (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            )}
            {inspected && (
              <>
                <div className='rounded-lg border p-4'>
                  <MarkdownInstructions>
                    {inspected.manifest.instructions}
                  </MarkdownInstructions>
                </div>
                <pre className='max-h-40 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap'>
                  {inspected.licenseText}
                </pre>
                <p className='text-xs break-all text-muted-foreground'>
                  Content SHA-256: {inspected.sha256}
                </p>
                <label className='block space-y-1 text-sm'>
                  <span>License</span>
                  <Input
                    placeholder='MIT, Apache-2.0, or reviewed license'
                    maxLength={100}
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                  />
                </label>
                <label className='flex gap-2 text-sm'>
                  <input
                    type='checkbox'
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed these instructions and the upstream license for our
                  use.
                </label>
              </>
            )}
          </div>
          <div className='flex justify-end gap-2 border-t pt-4'>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!inspected || !reviewed || !license.trim() || busy}
              onClick={() => {
                if (inspected) {
                  onDocument({ ...inspected.manifest, license: license.trim() })
                  setOpen(false)
                }
              }}
            >
              Open draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
