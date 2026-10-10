import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SettingsLink() {
  return (
    <Button variant='ghost' size='icon' asChild>
      <Link
        to='/organization-settings'
        search={{ identityLink: undefined }}
        aria-label='Settings'
      >
        <Settings aria-hidden='true' />
      </Link>
    </Button>
  )
}
