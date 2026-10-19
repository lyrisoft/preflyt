import { Sparkles } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { StatusBadge } from '@/components/status-badge'
import { useNavigationSession } from '../workspace/navigation-session'
import { SkillsCatalogue } from './skills-catalogue'

const help = [
  {
    title: 'Markdown skill files',
    content:
      'Write instructions in Markdown and use Preview to review them. Upload SKILL.md to open an editable draft; uploading does not save, approve or enable it. The UTF-8 file must be at most 128 KiB. Its YAML header must include a name and a description of up to 2,000 characters; Markdown instructions below the header can contain up to 24,000 characters. Optional header fields are source, license, stages, repositories, languages and frameworks. Enter the source and license before saving. Download SKILL.md exports the selected database version. Existing policies keep their approved version and digest; file changes require a new draft and approval. Preview does not run HTML or load linked images.',
  },
  {
    title: 'Third-party imports',
    content:
      'Import from GitHub pins a public repository commit, reads only SKILL.md and a license file, and shows the checksum for review. A reviewed license is required before opening a draft. Approval and enablement remain separate. Companion scripts are not fetched or executed.',
  },
  {
    title: 'What skills do',
    content:
      'Review skills analyze saved evidence and verified PR changes when source sharing is enabled. They cannot run commands, approve policies or change check results. The bundled GitHub Actions workflow skill is used automatically when you select Rewrite workflow in Policies: it drafts YAML for review while preserving existing jobs and deployment steps. It does not execute or publish changes.',
  },
  {
    title: 'Create and approve',
    content:
      'Built-in skills provide Markdown review steps for existing engineering checks. Filter by skill or check, preview the instructions, then Use skill to create or reopen the organization draft. Owners and Admins can save drafts. Review the instructions, source and license before approving the version, then enable it. Editing creates a new draft version. Policy Managers and Security Engineers can approve versions but cannot enable them.',
  },
  {
    title: 'Assign and run',
    content:
      'Assign an approved skill version to an AI Review in Standards, choose its review stages, then select that standard in a branch policy. Open a new saved assessment, select up to three assigned AI Reviews and run explicitly, or enable automatic reviews on the Pull requests model route for a published branch policy. Skills can restrict repository, language and framework scope. A constrained skill needs the exact-commit profile to match; missing or different-commit detection skips it. A tested model route is required. Suggestions stay separate from deterministic gates.',
  },
]
export function SkillsPage() {
  const session = useNavigationSession()
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Skills' }]} />
      <Main>
        <div className='space-y-6'>
          <PageHeader
            title='Skills'
            titleBadge={<StatusBadge tone='warning'>beta</StatusBadge>}
            description='Instructions for AI reviews and workflow editing.'
            section='Intelligence'
            icon={Sparkles}
            tone='violet'
            actions={<PageHelpDrawer title='Skills' sections={help} />}
          />
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
