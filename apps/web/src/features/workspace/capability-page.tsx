import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { canAdminister, useNavigationSession } from './navigation-session'

const capabilities = {
  findings: {
    title: 'Findings',
    description:
      'Review security and test issues from imported check results and reports.',
    to: '/integrations',
    action: 'Review check results and reports',
    admin: false,
  },
  'quality-gates': {
    title: 'Quality Gates',
    description:
      'Preflyt does not decide whether changes can merge yet. Saved assessments show missing or unverified evidence; they do not mean all required checks passed.',
    to: '/assessments',
    action: 'Review assessments',
    admin: false,
  },
  intelligence: {
    title: 'AI Intelligence',
    description:
      'AI investigations and explanations are not available yet. Review the assessment evidence for the relevant commit before drawing conclusions.',
    to: '/assessments',
    action: 'Review assessments',
    admin: false,
  },
  'access-control': {
    title: 'Access Control',
    description:
      'Organization member and role management is not available in the UI yet. Existing API permissions remain enforced.',
    to: '/apps',
    action: 'Review repositories',
    admin: true,
  },
  'organization-settings': {
    title: 'Settings',
    description:
      'Organization configuration and AI provider management are not available in the UI yet. Deployment configuration is managed by the operator.',
    to: '/integrations',
    action: 'Review integrations',
    admin: true,
  },
} as const

export function CapabilityPage({
  capability,
}: {
  capability: keyof typeof capabilities
}) {
  const config = capabilities[capability]
  const session = useNavigationSession()
  const allowed = !config.admin || canAdminister(session.data?.role)
  return (
    <>
      <AppHeader breadcrumbs={[{ label: config.title }]} />
      <Main>
        <h1 className='mb-6 text-2xl font-bold tracking-tight'>
          {config.title}
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>
              {allowed
                ? 'Planned MVP capability'
                : session.isPending
                  ? 'Checking access…'
                  : session.isError
                    ? 'Access details unavailable'
                    : 'Administrator access required'}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {allowed ? (
              <>
                <p className='text-sm text-muted-foreground'>
                  {config.description}
                </p>
                <Button variant='outline' asChild>
                  <Link to={config.to}>{config.action}</Link>
                </Button>
              </>
            ) : (
              <p className='text-sm text-muted-foreground'>
                This section is restricted to Preflyt Owners, Admins and Super
                Admins.
              </p>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
