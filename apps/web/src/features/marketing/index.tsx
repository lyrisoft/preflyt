import { ArrowRight, ArrowUpRight, Layers } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import release from '../../../../../release.json'
import { EngineeringFigures } from './engineering-figures'
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
        Understand your code.
        <br />
        Keep the context.
      </>
    ),
    href: '/product/repository-health',
    description:
      'Understand repository health through reported findings, comparable assessments and the source at the original commit. See what ran, what was measured and what needs your attention.',
    items: [
      {
        title: 'Findings at the commit',
        text: 'Investigate reported issues with their rule, file and original revision.',
      },
      {
        title: 'Comparable reports',
        text: 'Follow the trend when analyzer and scope evidence can be compared.',
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
        See the issue. <br />
        Find the next step.
      </>
    ),
    href: '/product/repository-health',
    description:
      'Investigate reported issues across your repositories. Read severity and check breakdowns, filter the finding list and keep missing or unverified results visible alongside the evidence.',
    items: [
      {
        title: 'Severity and check charts',
        text: 'Understand the recorded distribution before investigating an issue.',
      },
      {
        title: 'Findings at the source',
        text: 'Follow a finding to its rule, file and assessed revision.',
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
        Follow the work. <br />
        Keep the context.
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
        title: 'PR revision evidence',
        text: 'Distinguish a recorded snapshot from a pull request without a matching one.',
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
        Your requirements.
        <br />A traceable result.
      </>
    ),
    href: '/product/standards-and-evidence',
    description:
      'Bring versioned engineering requirements and verified CI results into one review. Every result stays bound to the policy and commit; missing evidence remains incomplete.',
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
        A clearer review.
        <br />
        Before the merge.
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
    <MarketingLayout>
      <main id='main' className='reference-home'>
        <section className='reference-hero container'>
          <div className='hero-copy'>
            <span className='reference-label'>
              Self-hosted. Apache-2.0. Built for GitHub.
            </span>
            <h1>
              Open source
              <br />
              engineering assurance.
            </h1>
            <p>
              Know what passed and what needs attention. Bring repository
              health, approved engineering standards and verified CI evidence
              into one self-hosted workspace.
            </p>
            <div className='reference-actions'>
              <a href={docs} className='button'>
                Community install guide{' '}
                <ArrowRight size={15} aria-hidden='true' />
              </a>
              <a
                href='https://github.com/lyrisoft/preflyt'
                className='text-link'
              >
                View on GitHub <ArrowRight size={14} aria-hidden='true' />
              </a>
            </div>
            <div className='hero-release-info'>
              <div
                className='reference-release-badges'
                aria-label='Releases and Community license'
              >
                <a
                  href={`https://github.com/lyrisoft/preflyt/releases/tag/v${release.latestStable}`}
                  aria-label={`Preflyt v${release.latestStable} release`}
                >
                  <img
                    src={`https://img.shields.io/badge/Preflyt-v${release.latestStable}-2f6f60?logo=github`}
                    alt={`Preflyt v${release.latestStable}`}
                    height={20}
                  />
                </a>
                <a
                  href='https://github.com/marketplace/actions/preflyt-policy-check'
                  aria-label='Preflyt Action on GitHub Marketplace'
                >
                  <img
                    src='https://img.shields.io/github/v/release/lyrisoft/preflyt-action?label=Preflyt%20Action&logo=github'
                    alt='Preflyt Action published release on GitHub Marketplace'
                    height={20}
                  />
                </a>
                <a
                  href='https://www.apache.org/licenses/LICENSE-2.0'
                  aria-label='Preflyt Community Edition license: Apache-2.0'
                >
                  <img
                    src='https://img.shields.io/badge/license-Apache--2.0-blue'
                    alt='Preflyt Community Edition: Apache-2.0 license'
                    height={20}
                  />
                </a>
              </div>
              <p className='community-release-note'>
                Community Edition · Apache-2.0. Container images are public.
                Public source release is in preparation.
              </p>
            </div>
          </div>
          <HeroArtwork />
        </section>
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
                    <a className='reference-more' href={feature.href}>
                      Learn more <ArrowRight size={13} aria-hidden='true' />
                    </a>
                  </div>
                </div>
                <ProductScene variant={feature.id} />
                <div className='reference-feature-index'>
                  <span>Explore</span>
                  <div className='reference-feature-index-links'>
                    {feature.items.map((item) => (
                      <div key={item.title}>
                        <a href={feature.href}>
                          {item.title}{' '}
                          <ArrowUpRight size={12} aria-hidden='true' />
                        </a>
                        <p>{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
        <section className='reference-tour container' id='workspace-tour'>
          <div className='reference-tour-heading'>
            <h2>See the work behind the result.</h2>
            <p>
              Findings, contributor activity and repository evidence, connected
              in one workspace.
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
        <section className='reference-process container' id='how-it-works'>
          <SectionIllustration variant='process' />
          <div>
            <p className='reference-label'>Fits the way you build</p>
            <h2>Start with one repository.</h2>
            <a className='text-link' href={docs}>
              Follow the getting-started guide{' '}
              <ArrowUpRight size={15} aria-hidden='true' />
            </a>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h3>Install Community Edition</h3>
                <p>
                  Start the Docker Compose stack and create your admin account.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Connect your GitHub App</h3>
                <p>
                  Choose repositories during installation in GitHub. They load
                  into Preflyt while you stay signed in as your admin.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Read your first Health report</h3>
                <p>
                  Review findings, affected code and analysis limits. The
                  bundled scanner runs supported checks without CI setup.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Add standards and PR feedback</h3>
                <p>
                  When you are ready, choose standards, publish a branch policy
                  and connect your CI results with the Preflyt Action.
                </p>
              </div>
            </li>
          </ol>
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
              reviews are optional: connect your own provider when you need
              suggestions. Core checks work without a paid model.
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
              Public contribution access opens with the Community release.
              Existing collaborators can use the repository links now.
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
