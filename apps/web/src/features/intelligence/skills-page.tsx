import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { useNavigationSession } from '../workspace/navigation-session'
import { SkillsCatalogue } from './skills-catalogue'

const help = [
  {
    title: 'Markdown skill files',
    content:
      'Write instructions in Markdown and use Preview to review them. Upload SKILL.md to open an editable draft; uploading does not save, approve or enable it. The UTF-8 file must be at most 32 KiB, with name and description in a YAML header and up to 6,000 instruction characters below it. Optional header fields are source, license, stages and repositories. Enter the source and license before saving. Download SKILL.md exports the selected database version. Existing policies keep their approved version and digest; file changes require a new draft and approval. Preview does not run HTML or load linked images.',
  },
  {
    title: 'What skills do',
    content:
      'Skills are reviewed instructions for advisory AI analysis. They cannot run commands, edit code, approve policies or change check results. The runtime reviews saved evidence and can include bounded verified PR changes when source sharing is enabled.',
  },
  {
    title: 'Create and approve',
    content:
      'Built-in skills provide Markdown review steps for existing engineering checks. Filter by skill or check, preview the instructions, then Use skill to create or reopen the organization draft. Owners and Admins can save drafts. Review the instructions, source and license before approving the version, then enable it. Editing creates a new draft version. Policy Managers and Security Engineers can approve versions but cannot enable them.',
  },
  {
    title: 'Assign and run',
    content:
      'Assign an approved skill version to an AI Review in Engineering Standards, choose its review stages, then adopt that standard version. Open a new saved assessment, select up to three assigned AI Reviews and run explicitly, or enable automatic reviews on the Pull requests model route for a published branch policy. Skills can optionally restrict repository scope. A tested model route and configured rates are required. Suggestions stay separate from deterministic gates.',
  },
]
export function SkillsPage() {
  const session = useNavigationSession()
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Skills' }]} />
      <Main>
        <div className='space-y-6'>
          <div className='flex items-center justify-between gap-3'>
            <h1 className='text-2xl font-semibold tracking-tight'>Skills</h1>
            <PageHelpDrawer title='Review skills' sections={help} />
          </div>
          {session.isPending ? (
            <p role='status'>Checking access…</p>
          ) : session.isError ? (
            <p role='alert'>
              Access details unavailable. Refresh and try again.
            </p>
          ) : (
            <SkillsCatalogue
              key={`${session.data?.identityId}:${session.data?.organizationId}`}
            />
          )}
        </div>
      </Main>
    </>
  )
}
