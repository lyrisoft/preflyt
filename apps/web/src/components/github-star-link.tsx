import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** A secondary community link, not a toggle for the user's GitHub star state. */
export function GitHubStarLink() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='hidden rounded-full bg-muted/20 shadow-none lg:inline-flex'
          asChild
        >
          <a
            href='https://github.com/lyrisoft/preflyt'
            target='_blank'
            rel='noopener noreferrer'
            aria-label='Star on GitHub (opens in a new tab)'
          >
            <Star aria-hidden='true' className='size-4' strokeWidth={1.75} />
            <span className='hidden xl:inline'>Star on GitHub</span>
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom' sideOffset={8}>
        Star Preflyt on GitHub · Opens in a new tab
      </TooltipContent>
    </Tooltip>
  )
}
