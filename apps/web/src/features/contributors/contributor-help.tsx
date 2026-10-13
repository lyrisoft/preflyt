import { PageHelpDrawer, type HelpSection } from '@/components/page-help-drawer'

const activityDefinitions = [
  ['Authored PRs', 'Distinct pull requests opened by this contributor.'],
  [
    'Merged PRs',
    'Authored pull requests recorded as merged; these are a subset of authored PRs.',
  ],
  [
    'Recorded reviews',
    'Distinct GitHub pull request reviews received by Preflyt.',
  ],
  [
    'Commits linked to contributor',
    'Distinct commits where GitHub records this contributor as author or committer. A commit counts once per repository even when the contributor has both roles. This does not imply authorship for committer-only records.',
  ],
]
const complianceDefinitions = [
  [
    'Pass rate',
    'PRs whose required checks passed, divided by fully assessed authored PRs. Missing evidence never counts as passing. A dash means there is not enough evidence to calculate a rate.',
  ],
  [
    'PRs fully assessed',
    'Fully assessed PRs divided by all authored PRs recorded in the selected period and repository scope.',
  ],
  [
    'Failed checks',
    'PRs with at least one known required-check failure. A PR can have both failed checks and missing evidence.',
  ],
  [
    'Missing evidence',
    'PRs without an assessment, with incomplete required evidence, or with an assessment for an older commit.',
  ],
]
const definitions = (items: string[][]) => (
  <dl className='space-y-3'>
    {items.map(([term, definition]) => (
      <div key={term}>
        <dt className='font-medium text-foreground'>{term}</dt>
        <dd className='mt-1'>{definition}</dd>
      </div>
    ))}
  </dl>
)
export function ContributorHelp({
  profile,
  limitations = [],
  lastReceivedAt,
  collectionEnabled,
}: {
  profile: boolean
  limitations?: string[]
  lastReceivedAt?: string | null
  collectionEnabled?: boolean
}) {
  const sections: HelpSection[] = [
    {
      title: 'Data sources',
      content: (
        <>
          <p>
            Preflyt shows recorded GitHub PRs, reviews and commits from
            repositories you can access. Refresh local data reloads saved
            records; Import recent GitHub activity requests a bounded set of
            recent records from GitHub.
          </p>
          <p>
            Activity dates use UTC. The selected period and repository filters
            apply to the charts, cards and tab lists.
          </p>
          {collectionEnabled !== undefined && (
            <p>
              Signed GitHub event collection is{' '}
              {collectionEnabled ? 'enabled' : 'disabled'}.
            </p>
          )}
          <p>
            {lastReceivedAt
              ? `Last received: ${new Date(lastReceivedAt).toLocaleString()}`
              : 'No contributor records received yet.'}
          </p>
        </>
      ),
    },
    {
      title: 'How activity is counted',
      content: (
        <>
          <p>
            Each object is counted once at its latest recorded activity date.
            Repeated GitHub events are not counted again. Counts describe
            participation; they do not measure employee performance.
          </p>
          {definitions(activityDefinitions)}
        </>
      ),
    },
    {
      title: 'Policy Compliance',
      content: (
        <>
          {definitions(complianceDefinitions)}
          <p>
            Results use saved standards in observe mode. They do not show
            published-policy enforcement or current merge readiness. Open Policy
            evidence to review the exact PR commit and assessment.
          </p>
          <p>
            Different standards versions are compared separately. First recorded
            means the first complete assessment found within this period under
            the same standards version, rather than the PR’s lifetime first
            assessment.
          </p>
          {!profile && (
            <p>
              PR assessment coverage counts saved assessments. A saved
              assessment is not necessarily verified or passing.
            </p>
          )}
        </>
      ),
    },
    {
      title: 'Access and limits',
      content: (
        <>
          <p>
            Repository and contributor permissions control which records are
            visible. A contributor’s GitHub activity does not grant Preflyt
            workspace access or prove GitHub organization membership.
          </p>
          <p>
            Tab lists paginate 20 records per page. Search and filters apply
            within the available imported records. A collection-limit warning
            means you should narrow the period or repository before drawing
            conclusions.
          </p>
          <ul className='list-disc space-y-2 pl-4'>
            {limitations.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      ),
    },
  ]
  return (
    <PageHelpDrawer
      title={profile ? 'Contributor profile' : 'Contributors'}
      sections={sections}
    />
  )
}
