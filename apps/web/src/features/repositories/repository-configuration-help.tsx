import type { HelpSection } from '@/components/page-help-drawer'

export const repositoryConfigurationHelp: HelpSection[] = [
  {
    title: 'Check configuration labels',
    content: (
      <dl className='space-y-3'>
        <div>
          <dt className='font-medium text-foreground'>
            Files found / Related files found
          </dt>
          <dd>
            The inspector found related setup files at the inspected commit.
            This does not prove the check ran or passed.
          </dd>
        </div>
        <div>
          <dt className='font-medium text-foreground'>Not found</dt>
          <dd>
            The inspector supports this check but did not find a recognized
            setup hint in the inspected files. Review its setup; an unrecognized
            configuration may still exist.
          </dd>
        </div>
        <div>
          <dt className='font-medium text-foreground'>
            Configuration not determined
          </dt>
          <dd>
            The check has a setup detector, but the available inspection data is
            missing or inconclusive. Review the profile and its limitations,
            then refresh it if needed.
          </dd>
        </div>
        <div>
          <dt className='font-medium text-foreground'>CI evidence required</dt>
          <dd>
            Repository inspection has no setup detector for this check,
            including build validation and type checking. It is not a setup gap
            or a pass. Open Assessments to see whether CI ran the check and
            supplied verified evidence. A required check stays incomplete until
            its required evidence is verified.
          </dd>
        </div>
      </dl>
    ),
  },
  {
    title: 'Filters and configuration counts',
    content: (
      <>
        <p>
          <strong>All</strong> includes every selected check.{' '}
          <strong>Setup gaps</strong> includes Not found and Configuration not
          determined. <strong>Files found</strong> includes recognized setup
          hints. <strong>CI checks</strong> includes checks labeled CI evidence
          required; these are excluded from Setup gaps.
        </p>
        <p>
          <strong>Configuration hints</strong> counts files found against checks
          with setup detectors, excluding CI-only checks from the denominator.
          When every check requires CI evidence, it shows a dash and the number
          of CI checks instead of a misleading zero coverage ratio.
        </p>
        <p>
          The configuration charts include all selected checks and separate CI
          evidence required from missing or undetermined setup. Required and
          advisory describe the selected requirements, not execution results.
          Open Assessments for pass, fail and incomplete results.
        </p>
      </>
    ),
  },
]
