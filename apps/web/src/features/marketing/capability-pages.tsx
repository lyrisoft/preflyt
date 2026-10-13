import { useEffect } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  GitBranch,
  GitPullRequest,
  Layers,
  LockKeyhole,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { MarketingLayout } from './marketing-layout'
import { publicPages } from './public-pages'
import { RepositoryPreview } from './repository-preview'
import { SectionIllustration } from './section-illustration'
import { WorkspaceWindow } from './workspace-window'

const docs = 'https://lyrisoft.github.io/preflyt/'
type Capability =
  'repository-health' | 'standards-and-evidence' | 'merge-protection'
const capabilities: {
  id: Capability
  label: string
  title: string
  description: string
  icon: LucideIcon
}[] = [
  {
    id: 'repository-health',
    label: 'Repository health',
    title: 'Find the issue. Keep the context.',
    description:
      'Identify supported security and quality risks, inspect the assessed source and follow comparable repository health reports.',
    icon: GitBranch,
  },
  {
    id: 'standards-and-evidence',
    label: 'Standards & evidence',
    title: 'Your standards. A traceable result.',
    description:
      'Apply approved engineering requirements through versioned policies and verified evidence from your existing CI.',
    icon: BookOpen,
  },
  {
    id: 'merge-protection',
    label: 'Merge Protection',
    title: 'A clear review before the merge.',
    description:
      'Connect readiness results to reviewed GitHub protections, with current evidence and an explicit activation.',
    icon: ShieldCheck,
  },
]
function PageMetadata({ path }: { path: string }) {
  useEffect(() => {
    const page = publicPages.find((page) => page.path === path)!
    document.title = page.title
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', page.description)
  }, [path])
  return null
}
function DocLink({
  path,
  children,
}: {
  path: string
  children: React.ReactNode
}) {
  return (
    <a
      className='text-link'
      href={`${docs}${path}`}
      target='_blank'
      rel='noreferrer'
    >
      {children}
      <ArrowUpRight className='icon small' aria-hidden='true' />
    </a>
  )
}
function CapabilityNav({ active }: { active?: Capability }) {
  return (
    <nav className='capability-nav container' aria-label='Product capabilities'>
      <a href='/product' aria-current={!active ? 'page' : undefined}>
        Product overview
      </a>
      {capabilities.map((item) => (
        <a
          key={item.id}
          href={`/product/${item.id}`}
          aria-current={active === item.id ? 'page' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
function Closing({
  title = 'Give every change a clearer path forward.',
}: {
  title?: string
}) {
  return (
    <section className='closing container'>
      <span className='closing-rule' />
      <h2>{title}</h2>
      <a
        className='button'
        href={`${docs}getting-started`}
        target='_blank'
        rel='noreferrer'
      >
        Get started with Preflyt
        <ArrowUpRight className='icon small' aria-hidden='true' />
      </a>
    </section>
  )
}
function Steps({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ol className='workflow-steps'>
      {items.map((item, index) => (
        <li key={item.title}>
          <span className='workflow-index'>
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </li>
      ))}
    </ol>
  )
}
export function ProductPage() {
  return (
    <MarketingLayout>
      <PageMetadata path='/product' />
      <main id='main'>
        <section className='hero capability-hero container'>
          <SectionIllustration variant='process' />
          <div className='hero-copy'>
            <p className='eyebrow'>Engineering assurance &amp; readiness</p>
            <h1>
              Engineering confidence.
              <br />
              Backed by <em>evidence.</em>
            </h1>
            <p className='hero-description'>
              Connect repository health, approved standards and verified CI
              evidence in one self-hosted platform. Give developers and
              engineering leaders a traceable readiness result for each assessed
              change.
            </p>
            <div className='hero-actions'>
              <a className='button' href='#capabilities'>
                Explore the platform
                <ArrowRight className='icon small' aria-hidden='true' />
              </a>
              <DocLink path='getting-started'>Get started</DocLink>
            </div>
            <p className='hero-note'>
              Engineering confidence before production.
            </p>
          </div>
          <EvidenceFlow />
        </section>
        <CapabilityNav />
        <section className='capability-grid container' id='capabilities'>
          {capabilities.map((item) => (
            <a
              className='capability-card'
              href={`/product/${item.id}`}
              key={item.id}
            >
              <item.icon className='icon' aria-hidden='true' />
              <p className='section-label'>{item.label}</p>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span className='text-link'>
                Explore {item.label}
                <ArrowRight className='icon small' aria-hidden='true' />
              </span>
            </a>
          ))}
        </section>
        <section className='capability-workspace container'>
          <WorkspaceWindow />
        </section>
        <section className='workflow-section container'>
          <div className='workflow-heading'>
            <p className='section-label'>One connected workflow</p>
            <h2>
              Start with visibility.
              <br />
              Build a clearer review.
            </h2>
          </div>
          <Steps
            items={[
              {
                title: 'Connect the repository',
                text: 'Select repositories from your GitHub App installation and explore their detected stack.',
              },
              {
                title: 'Investigate the codebase',
                text: 'Review supported Health findings, source context and analysis limits.',
              },
              {
                title: 'Define the requirements',
                text: 'Adopt versioned standards, publish a branch policy and connect CI reports.',
              },
              {
                title: 'Review each change',
                text: 'Follow the current commit’s check result; activate GitHub enforcement explicitly.',
              },
            ]}
          />
          <p className='workflow-note'>
            Identify repository risks early. Verify approved requirements.
            Review readiness with the evidence behind the result.
          </p>
        </section>
        <section className='capability-boundary container'>
          <LockKeyhole className='icon' aria-hidden='true' />
          <div>
            <p className='section-label'>Control stays with your team</p>
            <h2>
              Your environment.
              <br />
              Your review process.
            </h2>
            <p>
              Run Preflyt in your infrastructure. Configure repository access
              and optional AI providers. AI explanations are suggestions;
              deterministic checks evaluate the evidence, and GitHub applies
              your merge rules.
            </p>
            <a className='text-link' href='/self-hosting'>
              Explore self-hosting
              <ArrowRight className='icon small' aria-hidden='true' />
            </a>
          </div>
        </section>
        <Closing />
      </main>
    </MarketingLayout>
  )
}
function EvidenceFlow() {
  return (
    <div
      className='evidence-scene capability-flow'
      aria-label='Repository context, standards and CI reports connect to a commit-bound merge review'
    >
      <div className='scene-grid' />
      <p className='section-label'>The evidence behind the change</p>
      {[
        {
          icon: GitBranch,
          label: 'Repository',
          text: 'Source at the assessed commit',
        },
        {
          icon: BookOpen,
          label: 'Standards',
          text: 'Reviewed requirements and versions',
        },
        {
          icon: GitPullRequest,
          label: 'CI evidence',
          text: 'Verified reports for the current change',
        },
      ].map((item) => (
        <div className='flow-stage' key={item.label}>
          <item.icon className='icon' aria-hidden='true' />
          <div>
            <strong>{item.label}</strong>
            <p>{item.text}</p>
          </div>
          <ArrowRight className='icon small' aria-hidden='true' />
        </div>
      ))}
      <div className='flow-result'>
        <ShieldCheck className='icon' aria-hidden='true' />
        <div>
          <strong>Merge review result</strong>
          <p>GitHub applies the configured rules.</p>
        </div>
      </div>
    </div>
  )
}
const content = {
  'repository-health': {
    headline: (
      <>
        Understand the code.
        <br />
        Follow the <em>evidence.</em>
      </>
    ),
    intro:
      'Identify engineering risks early with supported security and quality analysis. Inspect the assessed source, prioritize findings and see what the analysis actually covered.',
    detailTitle: 'A finding is the beginning.',
    detail:
      'The report keeps repository, branch, commit and analyzer outcomes together. Follow a reported issue to its rule, location, saved source context and available guidance.',
    features: [
      {
        title: 'Context at the right revision',
        text: 'Source excerpts are verified against the assessed commit. Missing source access or locations show an explanation. Secret findings hide the source.',
      },
      {
        title: 'Comparable history',
        text: 'Compare findings only when tool, configuration and measured scope are compatible. Missing or incompatible results never become zero.',
      },
      {
        title: 'Visible analysis limits',
        text: 'Read each analyzer’s outcome and recorded scope. A completed job may still produce a partial report; zero findings only applies to the analyzed scope.',
      },
    ],
    steps: [
      {
        title: 'Select a repository',
        text: 'Connect the GitHub App and choose the repositories to track.',
      },
      {
        title: 'Review the first report',
        text: 'Repository selection queues Health assessment. Executed scans require a separately qualified runtime.',
      },
      {
        title: 'Investigate a finding',
        text: 'Open the issue, read its rule and available source, then review the guidance.',
      },
      {
        title: 'Reassess the branch',
        text: 'Authorized users can request a new report. Each report retains its original commit and analysis limits.',
      },
    ],
    limits: [
      'The base installation can produce an inspection-only report. Scanner coverage depends on reviewed tools, rules and a qualified execution runtime.',
      'Current measured quality rule packs have narrow, explicit scope. Hotspots are candidates for human review, not confirmed vulnerabilities.',
      'Health does not rerun tests. Automatic exact-commit CI coverage ingestion remains pending; missing coverage evidence is unavailable.',
      'Health findings do not satisfy a branch policy, publish a readiness check or authorize a merge.',
    ],
    doc: 'user-guide',
    faqs: [
      {
        q: 'Do I need CI to investigate repository health?',
        a: 'No. Supported static analysis works independently of CI when the execution runtime is qualified. CI is needed for evidence such as test reports; Health itself does not run tests.',
      },
      {
        q: 'Does a lower finding count prove that issues were fixed?',
        a: 'No. The graph only compares compatible recorded scopes. No-longer-reported findings require review; they do not independently establish remediation.',
      },
    ],
  },
  'standards-and-evidence': {
    headline: (
      <>
        Make expectations clear.
        <br />
        Keep results <em>traceable.</em>
      </>
    ),
    intro:
      'Verify code changes against approved engineering requirements. Connect versioned standards, branch policies and CI results to the exact assessed commit.',
    detailTitle: 'Requirements that keep their context.',
    detail:
      'Choose built-in standards or create organization standards. Published policies retain their chosen versions, so editing a standard does not silently change the requirements for a branch.',
    features: [
      {
        title: 'Versioned engineering standards',
        text: 'Start with Baseline Engineering, Application Security, Backend Services, Frontend Applications or Infrastructure as Code. Copy and adapt them to your organization.',
      },
      {
        title: 'Explicit branch requirements',
        text: 'Choose Core, Recommended or Strict requirements. Organization and team requirements are inherited; a repository policy can add to them without weakening them.',
      },
      {
        title: 'Verified result sources',
        text: 'Use JUnit test reports and SARIF scan reports from your CI. Results must match the current PR commit, workflow run and report-producing jobs.',
      },
    ],
    steps: [
      {
        title: 'Choose your standards',
        text: 'An Owner or Admin selects up to five standards for a repository and reviews the requirement level.',
      },
      {
        title: 'Review the policy',
        text: 'Create a branch draft, review saved versions and get authorized approval before publishing.',
      },
      {
        title: 'Connect CI reports',
        text: 'Add the generated workflow snippet and configure check sources for JUnit or SARIF.',
      },
      {
        title: 'Read the result',
        text: 'Inspect passed, failed and incomplete requirements at the assessed commit. Review the original evidence.',
      },
    ],
    limits: [
      'Missing mandatory evidence produces Incomplete, never Passed. An uploaded report or success label alone is insufficient.',
      'Publishing a policy enables evaluation but does not activate a GitHub protection rule.',
      'Changing standards requires a new policy revision to change published requirements.',
      'AI Reviews offer suggestions and cannot waive or override deterministic check results.',
    ],
    doc: 'user-guide/standards',
    faqs: [
      {
        q: 'Can we define our own checks?',
        a: 'Yes. Organization standards can contain custom checks with a JUnit or SARIF result source, a report file and an optional workflow command. The CI result still needs verification.',
      },
      {
        q: 'Will editing a standard change an existing policy?',
        a: 'No. Published policies retain their saved versions. Create, approve and publish a new revision to adopt newer requirements.',
      },
    ],
  },
  'merge-protection': {
    headline: (
      <>
        Review the change.
        <br />
        Protect the <em>merge.</em>
      </>
    ),
    intro:
      'Use evidence-backed readiness results to enforce approved requirements through GitHub. Review and explicitly activate the protections your team needs.',
    detailTitle: 'A result. A rule. An explicit activation.',
    detail:
      'Preflyt publishes Preflyt / Engineering Readiness for the current pull request. GitHub enforces it when your branch rules require that check. Review the affected branches and pull requests before activating a managed ruleset.',
    features: [
      {
        title: 'Current pull request results',
        text: 'See the target branch, verified result and publishing state. Unknown or pending evidence is not presented as an old passing result.',
      },
      {
        title: 'Reviewed protection changes',
        text: 'Inspect GitHub rulesets, prepare a draft and review the exact configuration and affected pull requests before authorized activation.',
      },
      {
        title: 'Verified deployment and drift',
        text: 'Preflyt verifies managed activation and shows external differences. It does not silently overwrite drift. Rollback disables the managed ruleset rather than deleting it.',
      },
    ],
    steps: [
      {
        title: 'Get the checks working',
        text: 'Publish a policy and verify passing automatic PR checks on a test branch.',
      },
      {
        title: 'Choose how to enforce',
        text: 'Require Preflyt / Engineering Readiness in GitHub yourself, or prepare a managed ruleset draft.',
      },
      {
        title: 'Review the impact',
        text: 'Confirm branches, protections, affected PRs and the required approval.',
      },
      {
        title: 'Activate and verify',
        text: 'An authorized administrator explicitly applies the rule. GitHub blocks merges when its required check is failing or incomplete.',
      },
    ],
    limits: [
      'Managed activation needs the deployment feature enabled, a GitHub App with approved administration write access and a current passing automatic check for every protected branch.',
      'A different authorized administrator must approve. An active Super Admin self-approval exception is explicitly recorded in the audit history.',
      'Fork pull requests and merge queues are not supported. Managed ruleset changes apply to one repository at a time.',
      'AI reviews and Health assessments cannot grant GitHub merge permission. Existing GitHub protections remain authoritative.',
    ],
    doc: 'user-guide/merge-protection',
    faqs: [
      {
        q: 'Does saving a draft change GitHub?',
        a: 'No. Saving a draft only prepares the proposed configuration. Review and explicit authorized activation are required to apply it.',
      },
      {
        q: 'Can we manage branch rules directly in GitHub?',
        a: 'Yes. Require the Preflyt / Engineering Readiness check alongside your own CI checks. GitHub offers the check name after it has appeared on a pull request.',
      },
    ],
  },
}
export function CapabilityPage({ capability }: { capability: Capability }) {
  const item = capabilities.find((item) => item.id === capability)!
  const page = content[capability]
  return (
    <MarketingLayout>
      <PageMetadata path={`/product/${capability}`} />
      <main id='main'>
        <section className='hero capability-hero container'>
          <SectionIllustration
            variant={
              capability === 'repository-health'
                ? 'health'
                : capability === 'standards-and-evidence'
                  ? 'evidence'
                  : 'protection'
            }
          />
          <div className='hero-copy'>
            <p className='eyebrow'>{item.label}</p>
            <h1>{page.headline}</h1>
            <p className='hero-description'>{page.intro}</p>
            <div className='hero-actions'>
              <a className='button' href='#how-to-start'>
                See how to start
                <ArrowRight className='icon small' aria-hidden='true' />
              </a>
              <DocLink path={page.doc}>Read the guide</DocLink>
            </div>
          </div>
          {capability === 'repository-health' ? (
            <HealthStory />
          ) : capability === 'standards-and-evidence' ? (
            <StandardsStory />
          ) : (
            <ProtectionStory />
          )}
        </section>
        <CapabilityNav active={capability} />
        <section className='capability-details container'>
          <div className='section-heading'>
            <p className='section-label'>From context to action</p>
            <h2>{page.detailTitle}</h2>
            <p>{page.detail}</p>
          </div>
          <div className='capability-grid'>
            {page.features.map((feature) => (
              <article className='capability-card' key={feature.title}>
                <item.icon className='icon' aria-hidden='true' />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
        {capability === 'repository-health' && (
          <section className='capability-demo container'>
            <p className='section-label'>Inside Preflyt · Northstar</p>
            <div className='product-preview'>
              <RepositoryPreview />
            </div>
          </section>
        )}
        <section id='how-to-start' className='workflow-section container'>
          <div className='workflow-heading'>
            <p className='section-label'>Put it to work</p>
            <h2>
              A practical path
              <br />
              to your first result.
            </h2>
          </div>
          <Steps items={page.steps} />
          <DocLink path={page.doc}>Follow the documentation</DocLink>
        </section>
        <section className='capability-limits container'>
          <p className='section-label'>Know the boundaries</p>
          <h2>
            Clear scope.
            <br />
            Useful expectations.
          </h2>
          <ul>
            {page.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>
        <section className='faq-section container'>
          <div>
            <p className='section-label'>A few useful answers</p>
            <h2>Before you get started.</h2>
          </div>
          <div className='faq-list'>
            {page.faqs.map((faq) => (
              <details key={faq.q}>
                <summary>
                  {faq.q}
                  <ArrowRight className='icon small' aria-hidden='true' />
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
        <Closing />
      </main>
    </MarketingLayout>
  )
}
function HealthStory() {
  return (
    <div className='evidence-scene capability-flow'>
      <div className='scene-grid' />
      <p className='section-label'>Follow a finding</p>
      <div className='story-code'>
        <span>Repository → assessed commit → source</span>
        <code>src/requests/handler.ts</code>
        <pre>
          <code>
            {
              'try {\n  await processRequest(input)\n} catch (error) {\n  // Review exception handling\n}'
            }
          </code>
        </pre>
      </div>
      <div className='flow-stage'>
        <GitBranch className='icon' aria-hidden='true' />
        <div>
          <strong>Keep the original context</strong>
          <p>Rule · severity · file · assessed revision</p>
        </div>
      </div>
      <div className='flow-result'>
        <BookOpen className='icon' aria-hidden='true' />
        <div>
          <strong>Review the guidance</strong>
          <p>Advice grounded in the reported pattern.</p>
        </div>
      </div>
    </div>
  )
}
function StandardsStory() {
  return (
    <div className='evidence-scene capability-flow'>
      <div className='scene-grid' />
      <p className='section-label'>Requirements meet evidence</p>
      <div className='flow-stage'>
        <BookOpen className='icon' aria-hidden='true' />
        <div>
          <strong>Versioned standards</strong>
          <p>Published branch policy</p>
        </div>
        <StatusBadge tone='neutral'>Published</StatusBadge>
      </div>
      {[
        { name: 'Test report verified', status: 'Passed' },
        { name: 'Required scan reported issues', status: 'Failed' },
        { name: 'Required result missing', status: 'Incomplete' },
      ].map((row) => (
        <div className='evidence-row' key={row.name}>
          <span>{row.name}</span>
          <StatusBadge tone='neutral'>{row.status}</StatusBadge>
        </div>
      ))}
      <div className='flow-result'>
        <ShieldCheck className='icon' aria-hidden='true' />
        <div>
          <strong>Every result has a reason</strong>
          <p>AI guidance cannot change a check outcome.</p>
        </div>
      </div>
    </div>
  )
}
function ProtectionStory() {
  return (
    <div className='evidence-scene capability-flow'>
      <div className='scene-grid' />
      <p className='section-label'>Review before activation</p>
      <div className='flow-stage'>
        <GitPullRequest className='icon' aria-hidden='true' />
        <div>
          <strong>Preflyt / Engineering Readiness</strong>
          <p>Verified evidence for the current PR commit</p>
        </div>
      </div>
      <div className='evidence-row'>
        <span>Prepare branch rule</span>
        <StatusBadge tone='neutral'>Draft</StatusBadge>
      </div>
      <div className='evidence-row'>
        <span>Review affected pull requests</span>
        <StatusBadge tone='neutral'>Pending review</StatusBadge>
      </div>
      <div className='flow-result'>
        <ShieldCheck className='icon' aria-hidden='true' />
        <div>
          <strong>Activate explicitly on GitHub</strong>
          <p>GitHub enforces the required check.</p>
        </div>
      </div>
    </div>
  )
}
export function SelfHostingPage() {
  return (
    <MarketingLayout>
      <PageMetadata path='/self-hosting' />
      <main id='main'>
        <section className='hero capability-hero container'>
          <SectionIllustration variant='hosting' />
          <div className='hero-copy'>
            <p className='eyebrow'>Self-hosted by design</p>
            <h1>
              Your infrastructure.
              <br />
              Your engineering <em>standards.</em>
            </h1>
            <p className='hero-description'>
              Run your engineering assurance platform on a single host or in
              your Kubernetes cluster. Keep deployment, repository access and
              optional AI connections under your control.
            </p>
            <div className='hero-actions'>
              <a
                className='button'
                href={`${docs}self-hosting`}
                target='_blank'
                rel='noreferrer'
              >
                Read deployment docs
                <ArrowUpRight className='icon small' aria-hidden='true' />
              </a>
              <a className='text-link' href='#deployment-options'>
                Choose a deployment
                <ArrowRight className='icon small' aria-hidden='true' />
              </a>
            </div>
          </div>
          <div className='evidence-scene capability-flow'>
            <div className='scene-grid' />
            <p className='section-label'>Your infrastructure</p>
            <div className='flow-stage'>
              <LockKeyhole className='icon' aria-hidden='true' />
              <div>
                <strong>Your HTTPS reverse proxy</strong>
                <p>One public application origin</p>
              </div>
            </div>
            <div className='flow-stage'>
              <Server className='icon' aria-hidden='true' />
              <div>
                <strong>Preflyt web · API · worker</strong>
                <p>GitHub integration and background processing</p>
              </div>
            </div>
            <div className='flow-result'>
              <Layers className='icon' aria-hidden='true' />
              <div>
                <strong>PostgreSQL · Valkey</strong>
                <p>Persistent data and a separate job queue</p>
              </div>
            </div>
          </div>
        </section>
        <section
          className='capability-details container'
          id='deployment-options'
        >
          <div className='section-heading'>
            <p className='section-label'>Choose your environment</p>
            <h2>
              One application.
              <br />
              Two deployment paths.
            </h2>
          </div>
          <div className='deployment-grid'>
            <article className='capability-card'>
              <Server className='icon' aria-hidden='true' />
              <h3>Docker Compose</h3>
              <p>
                The recommended starting point for a single host. Application
                services, database, cache and queue are coordinated through the
                existing Compose stack.
              </p>
              <DocLink path='self-hosting/docker-compose'>
                Deploy with Compose
              </DocLink>
            </article>
            <article className='capability-card'>
              <Layers className='icon' aria-hidden='true' />
              <h3>Kubernetes application bundle</h3>
              <p>
                Use the same images with cluster manifests. The bundle is
                single-instance; ingress, TLS, storage, capacity and backups
                remain your responsibility.
              </p>
              <DocLink path='self-hosting/kubernetes'>
                Deploy on Kubernetes
              </DocLink>
            </article>
          </div>
        </section>
        <section className='workflow-section container'>
          <div className='workflow-heading'>
            <p className='section-label'>From installation to first value</p>
            <h2>
              Deploy. Connect.
              <br />
              Start with one repository.
            </h2>
          </div>
          <Steps
            items={[
              {
                title: 'Prepare the environment',
                text: 'Obtain access to the private application images and choose a published release. Provide persistent storage and an HTTPS origin.',
              },
              {
                title: 'Configure and start',
                text: 'Follow the deployment guide, store credentials securely and complete the administrator setup.',
              },
              {
                title: 'Connect GitHub',
                text: 'Create and install the GitHub App with the required permissions. Configure sign-in and repository access.',
              },
              {
                title: 'Review a first report',
                text: 'Select a repository, review its inspection and configure a qualified runtime for supported scans. Connect CI for PR evidence.',
              },
            ]}
          />
          <DocLink path='getting-started'>
            Follow the getting-started guide
          </DocLink>
        </section>
        <section className='capability-limits container'>
          <p className='section-label'>Plan the essentials</p>
          <h2>
            Know what your
            <br />
            deployment needs.
          </h2>
          <ul>
            <li>
              Access to the private Preflyt images and an existing published
              release. Compose requires Docker and Compose 2.23.1 or later.
            </li>
            <li>
              A GitHub organization and a configured GitHub App. Production
              needs DNS, TLS and an HTTPS origin reachable for your integration.
            </li>
            <li>
              Persistent database and queue storage, off-host backups, secret
              management and an upgrade plan. Preserve configuration encryption
              keys.
            </li>
            <li>
              Native execution is disabled in the default stack. Scanners need a
              separate reviewed controller and qualified runtime; the
              application must not receive a Docker socket.
            </li>
            <li>
              AI providers and OpenTelemetry collection are optional. Kubernetes
              Operator support is planned, not part of the application bundle.
            </li>
          </ul>
        </section>
        <section className='operations-links container'>
          <h2>Keep it running well.</h2>
          {[
            {
              path: 'self-hosting/authentication',
              label: 'Authentication & access',
            },
            {
              path: 'self-hosting/reverse-proxy',
              label: 'Reverse proxy & TLS',
            },
            {
              path: 'self-hosting/upgrades-and-backups',
              label: 'Upgrades & backups',
            },
            { path: 'self-hosting/observability', label: 'Observability' },
          ].map((link) => (
            <DocLink key={link.path} path={link.path}>
              {link.label}
            </DocLink>
          ))}
        </section>
        <section className='faq-section container'>
          <div>
            <p className='section-label'>A few useful answers</p>
            <h2>Before you deploy.</h2>
          </div>
          <div className='faq-list'>
            <details>
              <summary>
                Do I need the Preflyt source code?
                <ArrowRight className='icon small' aria-hidden='true' />
              </summary>
              <p>
                No. Deployment uses the published application images. You need
                registry access and an available release tag.
              </p>
            </details>
            <details>
              <summary>
                Does the default stack run repository code?
                <ArrowRight className='icon small' aria-hidden='true' />
              </summary>
              <p>
                No. Native scans stay disabled until a separate reviewed
                execution controller and qualified runtime are configured.
              </p>
            </details>
            <details>
              <summary>
                Does Preflyt supply TLS and backups?
                <ArrowRight className='icon small' aria-hidden='true' />
              </summary>
              <p>
                Your deployment owns DNS, certificates, off-host backups and the
                monitoring backend. The documentation covers the application
                configuration and operating procedures.
              </p>
            </details>
          </div>
        </section>
        <Closing title='Bring a clearer review to your infrastructure.' />
      </main>
    </MarketingLayout>
  )
}
