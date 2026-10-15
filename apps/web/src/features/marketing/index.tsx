import { ArrowRight, ArrowUpRight, Layers } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EngineeringFigures } from './engineering-figures'
import { MarketingLayout } from './marketing-layout'
import { ProductScene } from './product-scene'
import { SectionIllustration } from './section-illustration'
import { WorkspaceWindow } from './workspace-window'

const docs = 'https://docs.preflytlabs.com/getting-started'
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
              Engineering Assurance &amp; Readiness Platform
            </span>
            <h1>
              Every change.
              <br />
              Verified against your standards.
            </h1>
            <p>
              Assess repository health, apply approved engineering standards and
              verify CI evidence before code reaches production. Know what
              passed, what failed and what still needs evidence.
            </p>
            <div
              className='reference-release-badges'
              aria-label='Published releases'
            >
              <a
                href='https://github.com/lyrisoft/preflyt/releases/tag/v0.1.1'
                aria-label='Preflyt v0.1.1 release'
              >
                <img
                  src='https://img.shields.io/badge/Preflyt-v0.1.1-2f6f60?logo=github'
                  alt='Preflyt v0.1.1'
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
            </div>
            <div className='reference-actions'>
              <a href={docs} className='button'>
                Get started <ArrowRight size={15} aria-hidden='true' />
              </a>
              <a href='#platform' className='text-link'>
                Explore Preflyt <ArrowRight size={14} aria-hidden='true' />
              </a>
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
          <Tabs defaultValue='contributors'>
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
                <h3>Connect GitHub</h3>
                <p>Select the repositories your team wants to track.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Explore the report</h3>
                <p>
                  Investigate supported findings, source context and analysis
                  limits.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Define the requirements</h3>
                <p>
                  Adopt standards, publish a policy and connect CI evidence.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Review each change</h3>
                <p>
                  Follow the current result into your pull request workflow.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className='reference-hosting container' id='self-hosting'>
          <SectionIllustration variant='hosting' />
          <Layers size={26} aria-hidden='true' />
          <div>
            <p className='reference-label'>Self-hosted by design</p>
            <h2>
              Your infrastructure.
              <br />
              Your engineering standards.
            </h2>
            <p>
              Deploy with Docker Compose or the Kubernetes application bundle.
              Native scans require a separate qualified runtime; your CI remains
              responsible for tests.
            </p>
            <a href='/self-hosting' className='reference-more'>
              Explore self-hosting <ArrowRight size={13} aria-hidden='true' />
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
                Supported static analysis works independently of CI when its
                execution runtime is qualified. The base installation can
                provide inspection-only reports.
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
        <section className='closing reference-closing container'>
          <h2>Bring clarity to the next change.</h2>
          <a href={docs} className='button'>
            Get started with Preflyt <ArrowRight size={15} aria-hidden='true' />
          </a>
        </section>
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
