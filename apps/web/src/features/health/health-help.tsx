import { PageHelpDrawer } from '@/components/page-help-drawer'
import { healthHelp } from './health-help-content'

export function HealthHelp() {
  return <PageHelpDrawer title='Repository health' sections={healthHelp} />
}
