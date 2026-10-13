import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export type HelpSection = { title: string; content: ReactNode }
/** Explanations live here; actionable warnings and actual results stay on the page. */
export function PageHelpDrawer({
  title,
  sections,
}: {
  title: string
  sections: HelpSection[]
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          aria-label={`Help for ${title}`}
        >
          <CircleHelp className='size-4' aria-hidden='true' />
          Help
        </Button>
      </SheetTrigger>
      <SheetContent className='w-full gap-0 motion-reduce:animate-none sm:max-w-xl'>
        <SheetHeader className='border-b p-6'>
          <SheetTitle>{title} help</SheetTitle>
          <SheetDescription>
            Metric definitions, data sources and how to read this page.
          </SheetDescription>
        </SheetHeader>
        <div className='flex-1 space-y-6 overflow-y-auto p-6'>
          {sections.map((section) => (
            <section key={section.title} className='space-y-3'>
              <h3 className='text-sm font-semibold'>{section.title}</h3>
              <div className='space-y-2 text-sm leading-relaxed text-muted-foreground'>
                {section.content}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
