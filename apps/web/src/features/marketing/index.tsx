import { ArrowRight, ArrowUpRight, Coffee, Layers, Star } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EngineeringFigures } from './engineering-figures'
import './homepage-refinements.css'
import { MarketingLayout, MarketingClosing } from './marketing-layout'
import { ProductScene } from './product-scene'
import { SectionIllustration } from './section-illustration'
import { WorkspaceWindow } from './workspace-window'

const docs = 'https://docs.preflytlabs.com/getting-started/quick-start'
const features = [
  {
    id: 'health',
    label: 'Repository health',
    title: (
      <>
        Find security risks.
        <br />
        Check code quality.
      </>
    ),
    href: '/product/repository-health',
    description:
      'Scan for exposed secrets, vulnerable dependencies and supported code issues. Track findings over time and inspect the source at the commit that was scanned.',
    items: [
      {
        title: 'Security and code quality checks',
        text: 'See reported issues and which parts of your repository were analyzed.',
      },
      {
        title: 'Findings over time',
        text: 'Compare scans when they cover the same checks and scope.',
      },
      {
        title: 'Clear analysis limits',
        text: 'See what ran, what was measured and what remains unavailable.',
      },
    ],
  },
  {
    id: 'findings',
    label: 'Findings',
    title: (
      <>
        See the affected code. <br />
        Know what to fix.
      </>
    ),
    href: '/product/repository-health',
    description:
      'Investigate issues across your repositories in one findings list. Review severity, affected lines and available remediation guidance, with analysis gaps kept visible.',
    items: [
      {
        title: 'Filter and prioritize',
        text: 'Narrow the list by repository, severity and finding source.',
      },
      {
        title: 'Findings at the source',
        text: 'Open the affected code at the commit that was scanned.',
      },
      {
        title: 'Missing evidence',
        text: 'See unavailable or unverified results without treating them as passed.',
      },
    ],
  },
  {
    id: 'contributors',
    label: 'Contributors',
    title: (
      <>
        See who contributed. <br />
        Follow their activity.
      </>
    ),
    href: '/product',
    description:
      'See recorded GitHub participation over time, the repositories people contributed to and which pull requests have saved revision evidence. Explore the directory with the activity behind each contributor.',
    items: [
      {
        title: 'Participation over time',
        text: 'Read activity in the selected period and repository scope.',
      },
      {
        title: 'Pull request assessments',
        text: 'See which pull requests have a saved assessment for their commit.',
      },
      {
        title: 'Contributor directory',
        text: 'Explore authored PRs, reviews and repository participation together.',
      },
    ],
  },
  {
    id: 'evidence',
    label: 'Standards & evidence',
    title: (
      <>
        Set your requirements.
        <br />
        Check each change.
      </>
    ),
    href: '/product/standards-and-evidence',
    description:
      'Choose the tests, scans and engineering checks your team requires. Preflyt checks results from your CI workflow against those requirements for the same commit. Missing required results stay incomplete.',
    items: [
      {
        title: 'Versioned standards',
        text: 'Choose reviewed requirements that stay bound to the published policy.',
      },
      {
        title: 'Verified CI results',
        text: 'Read tests and scans from your existing workflow at the assessed commit.',
      },
      {
        title: 'Missing stays missing',
        text: 'A required result without evidence is incomplete, never passed.',
      },
    ],
  },
  {
    id: 'protection',
    label: 'Merge Protection',
    title: (
      <>
        Require passing checks.
        <br />
        Before merging.
      </>
    ),
    href: '/product/merge-protection',
    description:
      'Connect the current Preflyt result to your pull request workflow. Review branch rules and their impact before activation. GitHub enforces merge permission; AI cannot override it.',
    items: [
      {
        title: 'Current pull request checks',
        text: 'Follow the verified Preflyt result on the change under review.',
      },
      {
        title: 'Explicit activation',
        text: 'Review the exact branch rules and affected PRs before applying them.',
      },
      {
        title: 'GitHub enforcement',
        text: 'GitHub owns merge permission. AI suggestions cannot override the rules.',
      },
    ],
  },
] as const
export function MarketingHomepage() {
  return (
    <MarketingLayout className='marketing-home'>
      <main id='main' tabIndex={-1} className='reference-home'>
        <section className='reference-hero container'>
          <div className='hero-copy'>
            <span className='reference-label'>Self-hosted · Apache-2.0</span>
            <h1>Open source code quality and security for GitHub.</h1>
            <p>
              Preflyt scans your repositories for security and code quality
              issues. See the affected code, understand what to fix, and check
              pull requests against your team's requirements.
            </p>
            <div className='reference-actions'>
              <a href={docs} className='button'>
                Install Preflyt <ArrowRight size={15} aria-hidden='true' />
              </a>
              <a
                href='https://github.com/lyrisoft/preflyt'
                className='button github-star'
                target='_blank'
                rel='noopener noreferrer'
                aria-label='Star on GitHub (opens in a new tab)'
              >
                <Star size={16} strokeWidth={1.75} aria-hidden='true' />
                Star on GitHub
              </a>
              <a
                className='button coffee-support'
                href='https://buymeamalt.com/@lyrixx'
                target='_blank'
                rel='noopener noreferrer'
                aria-label='Buy me a coffee (opens in a new tab)'
              >
                <Coffee size={16} aria-hidden='true' />
                Buy me a coffee
                <ArrowUpRight size={14} aria-hidden='true' />
              </a>
            </div>
            <div className='hero-release-info'>
              <div
                className='reference-release-badges'
                aria-label='Releases, issues and Community license'
              >
                <a
                  href='https://github.com/lyrisoft/preflyt/releases/latest'
                  aria-label='Latest Preflyt release'
                >
                  <img
                    src='https://img.shields.io/github/v/release/lyrisoft/preflyt?label=Preflyt&logo=github&color=2f6f60&cacheSeconds=300'
                    alt='Latest Preflyt release on GitHub'
                    height={19}
                  />
                </a>
                <a
                  href='https://github.com/lyrisoft/preflyt-action/releases/latest'
                  aria-label='Latest Preflyt Action release'
                >
                  <img
                    src='https://img.shields.io/github/v/release/lyrisoft/preflyt-action?label=Preflyt%20Action&logo=github&cacheSeconds=300'
                    alt='Latest Preflyt Action release on GitHub'
                    height={19}
                  />
                </a>
                <a
                  href='https://github.com/lyrisoft/preflyt/issues?q=is%3Aissue%20is%3Aopen'
                  aria-label='Preflyt issues on GitHub'
                >
                  <img
                    src='https://img.shields.io/github/issues/lyrisoft/preflyt?label=Issues&logo=github&color=64748b&cacheSeconds=300'
                    alt='Preflyt issues'
                    height={19}
                  />
                </a>
                <a
                  href='https://www.apache.org/licenses/LICENSE-2.0'
                  aria-label='Preflyt Community Edition license: Apache-2.0'
                >
                  <img
                    src='https://img.shields.io/badge/license-Apache--2.0-blue'
                    alt='Preflyt Community Edition: Apache-2.0 license'
                    height={19}
                  />
                </a>
              </div>
              <p className='community-release-note'>
                Community Edition · Apache-2.0. Source code and container images
                are public.
              </p>
            </div>
          </div>
          <HeroArtwork />
          <div className='hero-preview-caption'>
            <p>Repository health, findings and CI evidence in one workspace.</p>
            <a href='#workspace-tour' className='text-link'>
              Explore the workspace <ArrowRight size={14} aria-hidden='true' />
            </a>
          </div>
        </section>
        <HowItWorks />
        <EngineeringFigures />
        <div className='reference-foundation'>
          <div className='container'>
            <span>Built around your workflow</span>
            <strong>GitHub</strong>
            <strong>CI evidence</strong>
            <strong>Versioned standards</strong>
            <strong>Docker Compose</strong>
            <strong>Kubernetes</strong>
          </div>
        </div>
        <section
          id='platform'
          className='reference-platform'
          aria-label='The Preflyt engineering platform'
        >
          {features.map((feature) => (
            <article className='reference-feature' key={feature.id}>
              <div className='container'>
                <div className='reference-feature-heading'>
                  <div>
                    <p className='reference-label'>{feature.label}</p>
                    <h2>{feature.title}</h2>
                  </div>
                  <div className='reference-feature-copy'>
                    <p>{feature.description}</p>
                    <a
                      className='reference-more'
                      href={feature.href}
                      aria-label={`Learn more about ${feature.label.toLowerCase()}`}
                    >
                      Learn more <ArrowRight size={13} aria-hidden='true' />
                    </a>
                  </div>
                </div>
                <ProductScene variant={feature.id} />
                <div className='reference-feature-index'>
                  <ul className='reference-feature-index-links'>
                    {feature.items.map((item) => (
                      <li key={item.title}>
                        <strong>{item.title}</strong>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </section>
        <section
          className='reference-tour container'
          id='workspace-tour'
          tabIndex={-1}
        >
          <div className='reference-tour-heading'>
            <h2>See the work behind the result.</h2>
            <p>
              Findings, contributor activity and repository evidence, connected
              in one workspace. Choose a view and scroll to explore.
            </p>
          </div>
          <Tabs defaultValue='findings'>
            <TabsList
              aria-label='Focused workspace previews'
              className='reference-tour-tabs'
            >
              <TabsTrigger value='findings'>Findings</TabsTrigger>
              <TabsTrigger value='contributors'>Contributors</TabsTrigger>
              <TabsTrigger value='repository'>Repository details</TabsTrigger>
            </TabsList>
            <TabsContent value='findings'>
              <WorkspaceWindow
                initialView='findings'
                showNavigation={false}
                showRepositoryEvidence={false}
              />
            </TabsContent>
            <TabsContent value='contributors'>
              <WorkspaceWindow
                initialView='contributors'
                showNavigation={false}
                showRepositoryEvidence={false}
              />
            </TabsContent>
            <TabsContent value='repository'>
              <WorkspaceWindow
                initialView='repository'
                showNavigation={false}
                showRepositoryEvidence={false}
              />
            </TabsContent>
          </Tabs>
        </section>
        <section className='reference-hosting container' id='self-hosting'>
          <SectionIllustration variant='hosting' />
          <Layers size={26} aria-hidden='true' />
          <div>
            <p className='reference-label'>Community Edition · Apache-2.0</p>
            <h2>
              Your repositories.
              <br />
              Your infrastructure.
            </h2>
            <p>
              Free to self-host, with no repository cap. Run Health checks,
              investigate findings and verify CI results against your standards.
              Access controls and audit history are included. Capacity depends
              on your infrastructure.
            </p>
            <p>
              Start with Docker Compose and the bundled Health scanner. AI
              security review is optional and in beta: connect your own provider
              for source code review suggestions. Core checks work without a
              paid model.
            </p>
            <p>
              <strong>Managed Cloud is planned.</strong> A future paid service
              will focus on hosting, upgrades, backups and support. It is not
              available for signup yet.
            </p>
            <a href='/self-hosting' className='reference-more'>
              Explore self-hosting <ArrowRight size={13} aria-hidden='true' />
            </a>
          </div>
        </section>
        <section className='reference-community container' id='community'>
          <div>
            <h2>Help shape the checks your team needs.</h2>
            <p>
              Improve a standard, contribute a report integration, reproduce a
              scanner issue or make a guide clearer. Community contributions use
              DCO sign-off; you retain ownership of your work.
            </p>
            <p>
              Contributions are welcome. Read the contributing guide and discuss
              your idea in a GitHub issue.
            </p>
          </div>
          <div className='reference-actions'>
            <a
              className='text-link'
              href='https://github.com/lyrisoft/preflyt/blob/main/CONTRIBUTING.md'
            >
              Contribution guide <ArrowUpRight size={14} aria-hidden='true' />
            </a>
            <a
              className='text-link'
              href='https://github.com/lyrisoft/preflyt/issues'
            >
              Report an issue <ArrowUpRight size={14} aria-hidden='true' />
            </a>
          </div>
        </section>
        <section className='faq-section reference-faq container'>
          <div>
            <h2>A few useful answers.</h2>
            <a href='https://docs.preflytlabs.com/' className='text-link'>
              Read the docs <ArrowUpRight size={14} aria-hidden='true' />
            </a>
          </div>
          <div className='faq-list'>
            <details>
              <summary>
                Do I need CI to see repository health?
                <ArrowRight size={15} aria-hidden='true' />
              </summary>
              <p>
                No. The documented Docker Compose installation includes the
                Health scanner. Connected repositories receive supported static
                checks; each report shows its scope and any missing analysis.
                Test execution still belongs in your CI workflow.
              </p>
            </details>
            <details>
              <summary>
                Can AI approve or merge a pull request?
                <ArrowRight size={15} aria-hidden='true' />
              </summary>
              <p>
                No. AI explanations are suggestions. Deterministic checks
                evaluate the evidence; GitHub applies the configured merge
                rules.
              </p>
            </details>
            <details>
              <summary>
                Does Preflyt replace my CI pipeline?
                <ArrowRight size={15} aria-hidden='true' />
              </summary>
              <p>
                No. Your existing CI runs tests and scans. Preflyt connects
                verified reports to the branch requirements and current commit.
              </p>
            </details>
          </div>
        </section>
        <MarketingClosing title='Bring clarity to the next change.' />
      </main>
    </MarketingLayout>
  )
}
function HowItWorks() {
  return (
    <section className='reference-process container' id='how-it-works'>
      <SectionIllustration variant='process' />
      <div>
        <p className='reference-label'>How Preflyt works</p>
        <h2>From a repository to your next fix.</h2>
        <a className='text-link' href={docs}>
          Follow the setup guide <ArrowUpRight size={15} aria-hidden='true' />
        </a>
      </div>
      <ol>
        <li>
          <span>01</span>
          <div>
            <h3>Choose repositories to scan</h3>
            <p>
              Install Preflyt on your infrastructure, connect your GitHub App
              and select repositories. Preflyt runs supported security and code
              quality checks without CI setup.
            </p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h3>Investigate issues in the code</h3>
            <p>
              Open a finding to inspect the affected lines, why it matters and
              available fix guidance. Each report shows what was checked and any
              analysis limits.
            </p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <h3>Set checks for pull requests</h3>
            <p>
              Choose your team's requirements and connect test and scan results
              from CI. Configure GitHub to require the Preflyt check before
              merging.
            </p>
          </div>
        </li>
      </ol>
    </section>
  )
}
function HeroArtwork() {
  return (
    <div className='reference-hero-art evidence-scene'>
      <SectionIllustration variant='hero' />
      <div className='hero-art-window'>
        <WorkspaceWindow controls={false} />
      </div>
    </div>
  )
}
