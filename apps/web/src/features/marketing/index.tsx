import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  FileCode2,
  Fingerprint,
  GitBranch,
  GitPullRequest,
  ListChecks,
  ScanSearch,
  Server,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { MarketingLayout } from './marketing-layout'
import { ProductPreview } from './product-preview'
import { WorkflowPreview } from './workflow-preview'

export function MarketingHomepage() {
  return (
    <MarketingLayout>
      <main id='main'>
        <section className='hero container'>
          <div className='hero-copy'>
            <p className='eyebrow'>
              <span className='short-rule'></span>For teams building on GitHub
            </p>
            <h1>
              Engineering
              <br />
              confidence before
              <br />
              <span>production.</span>
            </h1>
            <p className='hero-description'>
              Understand repository health, investigate findings and review
              changes against your engineering standards.
            </p>
            <div className='hero-actions'>
              <Button asChild>
                <a
                  className='button'
                  href='https://lyrisoft.github.io/preflyt/getting-started'
                  target='_blank'
                  rel='noreferrer'
                >
                  Get started{' '}
                  <ArrowUpRight
                    aria-hidden='true'
                    focusable='false'
                    className='icon small'
                  />
                </a>
              </Button>
              <a className='text-link' href='#how-it-works'>
                See how it works{' '}
                <ArrowRight
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </a>
            </div>
            <p className='hero-note'>
              Self-hosted. GitHub native. Evidence at the core.
            </p>
          </div>
          <div
            className='evidence-scene'
            role='img'
            aria-label='Code, CI checks and engineering standards connect to a commit-bound assessment. Human review and GitHub rules remain separate parts of the workflow.'
          >
            <div className='scene-grid'></div>
            <div className='scene-top'>
              <span className='tiny-orbit'></span>Every change has a story.
            </div>
            <svg
              className='flow-lines'
              viewBox='0 0 560 460'
              preserveAspectRatio='none'
              aria-hidden='true'
            >
              <path className='line-muted' d='M35 0V420Q35 440 55 440H540' />
              <path
                className='line-muted'
                d='M10 108H130Q155 108 155 133V176Q155 196 180 196H270M10 224H270M10 340H130Q155 340 155 315V252Q155 224 180 224'
              />
              <path className='line-bright' d='M40 224H270' />
              <circle cx='155' cy='224' r='5' />
              <path
                className='line-muted'
                d='M412 378V416Q412 435 390 435H146'
              />
              <path className='line-muted' d='M412 435H526' />
              <circle cx='412' cy='435' r='4' />
            </svg>
            <div className='source-node source-code'>
              <FileCode2
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
              <span>Code</span>
            </div>
            <div className='source-node source-checks'>
              <ListChecks
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
              <span>CI checks</span>
            </div>
            <div className='source-node source-standards'>
              <BookOpen aria-hidden='true' focusable='false' className='icon' />
              <span>Standards</span>
            </div>
            <div className='assessment-sheet'>
              <div className='sheet-heading'>
                <GitPullRequest
                  aria-hidden='true'
                  focusable='false'
                  className='icon'
                />
                <span>Engineering readiness</span>
                <span className='sheet-dot'></span>
              </div>
              <div className='sheet-body'>
                <p className='sheet-kicker'>The evidence behind the change</p>
                <h2>
                  One commit.
                  <br />A clear picture.
                </h2>
                <div className='sheet-property'>
                  <span>Source</span>
                  <strong>Assessed revision</strong>
                </div>
                <div className='sheet-property'>
                  <span>Requirements</span>
                  <strong>Branch policy</strong>
                </div>
                <div className='sheet-property'>
                  <span>Evidence</span>
                  <strong>Required checks</strong>
                </div>
              </div>
              <div className='sheet-footer'>
                Saved assessment{' '}
                <ArrowUpRight
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </div>
            </div>
            <div className='human-node'>
              <span className='node-dot'></span>Human review
            </div>
            <div className='github-node'>
              <span className='node-dot'></span>GitHub rules
            </div>
            <div className='scene-bottom'>
              Follow the evidence. Understand the result.
            </div>
          </div>
        </section>

        <ProductPreview />
        <div className='principles container'>
          <div>
            <ScanSearch aria-hidden='true' focusable='false' className='icon' />
            <span>Know what needs attention</span>
          </div>
          <div>
            <Fingerprint
              aria-hidden='true'
              focusable='false'
              className='icon'
            />
            <span>Trace every review to its commit</span>
          </div>
          <div>
            <Server aria-hidden='true' focusable='false' className='icon' />
            <span>Run in your own infrastructure</span>
          </div>
        </div>

        <section className='product-section container' id='product'>
          <div className='section-intro'>
            <p className='section-label'>A clearer view of your codebase</p>
            <h2>
              From “what’s wrong?”
              <br />
              to what comes next.
            </h2>
            <p>
              Bring findings, code context and engineering requirements into one
              place. Give your team a useful next step.
            </p>
          </div>
          <div className='feature feature-health'>
            <div className='feature-copy'>
              <span className='feature-number'>01 / Repository health</span>
              <h3>
                Find the issue.
                <br />
                Keep the context.
              </h3>
              <p>
                Explore supported security and quality findings. See the
                affected code at the assessed commit, then understand why it
                matters.
              </p>
              <a
                className='text-link'
                href='https://lyrisoft.github.io/preflyt/user-guide'
                target='_blank'
                rel='noreferrer'
              >
                Explore the user guide{' '}
                <ArrowUpRight
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </a>
              <p className='fineprint'>
                Supported analysis depends on your setup. Native scans require a
                qualified runtime.
              </p>
            </div>
            <div
              className='finding-art'
              aria-label='Finding investigation connects the finding, code at the assessed commit, and guidance.'
            >
              <div className='art-toolbar'>
                <ScanSearch
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
                <span>Follow a finding</span>
                <span className='art-dots'>···</span>
              </div>
              <div className='finding-path'>
                <div className='path-stop'>
                  <span className='step-marker'>1</span>
                  <div>
                    <h4>The finding</h4>
                    <p>What needs attention</p>
                  </div>
                  <ArrowUpRight
                    aria-hidden='true'
                    focusable='false'
                    className='icon'
                  />
                </div>
                <div className='source-detail'>
                  <div className='source-detail-heading'>
                    <FileCode2
                      aria-hidden='true'
                      focusable='false'
                      className='icon'
                    />
                    <span>Code at the assessed commit</span>
                  </div>
                  <div className='code-drawing' aria-hidden='true'>
                    <span>{'{'}</span>
                    <div>
                      <i></i>
                      <i></i>
                      <i></i>
                    </div>
                    <span>{'}'}</span>
                  </div>
                  <div className='source-foot'>
                    <GitBranch
                      aria-hidden='true'
                      focusable='false'
                      className='icon small'
                    />
                    Original source. Original revision.
                  </div>
                </div>
                <div className='path-stop last'>
                  <span className='step-marker'>2</span>
                  <div>
                    <h4>A useful next step</h4>
                    <p>Problem, likely effect and suggested fix</p>
                  </div>
                  <Sparkles
                    aria-hidden='true'
                    focusable='false'
                    className='icon'
                  />
                </div>
              </div>
            </div>
          </div>
          <div className='feature feature-evidence'>
            <div className='evidence-art'>
              <p className='art-title'>
                <Workflow
                  aria-hidden='true'
                  focusable='false'
                  className='icon'
                />
                Requirements meet evidence.
              </p>
              <div className='policy-track'>
                <div className='policy-input'>
                  <BookOpen
                    aria-hidden='true'
                    focusable='false'
                    className='icon'
                  />
                  <strong>Your standards</strong>
                  <span>Reviewed versions</span>
                </div>
                <div className='track-link' aria-hidden='true'></div>
                <div className='policy-input'>
                  <GitBranch
                    aria-hidden='true'
                    focusable='false'
                    className='icon'
                  />
                  <strong>Branch policy</strong>
                  <span>Required checks</span>
                </div>
              </div>
              <div className='assessment-line'>
                <span className='line-dot'></span>
                <p>Assessment at the current commit</p>
              </div>
              <div className='result-explanations'>
                <div>
                  <StatusBadge tone='success'>Passed</StatusBadge>
                  <small>Evidence supports the result</small>
                </div>
                <div>
                  <StatusBadge tone='warning'>Incomplete</StatusBadge>
                  <small>Required results are missing</small>
                </div>
                <div>
                  <StatusBadge tone='error'>Failed</StatusBadge>
                  <small>A requirement needs attention</small>
                </div>
              </div>
              <p className='art-note'>
                AI guidance cannot change a policy result.
              </p>
            </div>
            <div className='feature-copy'>
              <span className='feature-number'>02 / Standards & evidence</span>
              <h3>
                Your standards.
                <br />A traceable result.
              </h3>
              <p>
                Connect versioned standards to branch policies and CI results.
                Understand which checks passed, which failed and what evidence
                is still missing.
              </p>
              <a
                className='text-link'
                href='https://lyrisoft.github.io/preflyt/'
                target='_blank'
                rel='noreferrer'
              >
                Read the documentation{' '}
                <ArrowUpRight
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </a>
              <p className='fineprint'>
                Preflyt evaluates the evidence. GitHub applies the configured
                merge rules.
              </p>
            </div>
          </div>
        </section>

        <WorkflowPreview />
        <section className='ai-section container'>
          <div className='ai-heading'>
            <Sparkles aria-hidden='true' focusable='false' className='icon' />
            <span>Optional AI guidance</span>
          </div>
          <div className='ai-layout'>
            <h2>
              More context.
              <br />
              <span>Better questions.</span>
            </h2>
            <div>
              <p>
                Get a concise explanation grounded in the finding and assessed
                code. Your team reviews the suggestion. Your policy still
                decides the result.
              </p>
              <div className='question-line'>
                <span>What happened?</span>
                <span>Why does it matter?</span>
                <span>What should change?</span>
              </div>
              <p className='fineprint'>
                Uses your configured models and source-sharing permissions.
              </p>
            </div>
          </div>
        </section>

        <section className='workflow-section container' id='how-it-works'>
          <div className='workflow-heading'>
            <p className='section-label'>Fits the way you build</p>
            <h2>
              Start with a repository.
              <br />
              Build a clearer review.
            </h2>
          </div>
          <ol className='workflow-steps'>
            <li>
              <span className='workflow-index'>01</span>
              <GitBranch
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
              <h3>Connect GitHub</h3>
              <p>Choose the repositories your team wants to track.</p>
            </li>
            <li>
              <span className='workflow-index'>02</span>
              <ScanSearch
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
              <h3>Explore repository health</h3>
              <p>
                Review the initial report, supported findings and analysis
                limits.
              </p>
            </li>
            <li>
              <span className='workflow-index'>03</span>
              <BookOpen aria-hidden='true' focusable='false' className='icon' />
              <h3>Set your requirements</h3>
              <p>
                Adopt standards, publish a branch policy and connect CI
                evidence.
              </p>
            </li>
            <li>
              <span className='workflow-index'>04</span>
              <GitPullRequest
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
              <h3>Review the change</h3>
              <p>
                Follow commit-specific results into your pull request workflow.
              </p>
            </li>
          </ol>
          <p className='workflow-note'>
            Repository health helps you investigate the codebase. CI evidence
            supports the merge review.
          </p>
        </section>

        <section className='hosting-wrap' id='self-hosting'>
          <div className='hosting container'>
            <div>
              <p className='section-label'>Self-hosted by design</p>
              <h2>
                Your infrastructure.
                <br />
                Your engineering
                <br />
                standards.
              </h2>
              <p>
                Run Preflyt in your environment, connect your GitHub
                repositories and configure access for your organization.
              </p>
              <Button asChild>
                <a
                  className='button'
                  href='https://lyrisoft.github.io/preflyt/self-hosting'
                  target='_blank'
                  rel='noreferrer'
                >
                  Explore self-hosting{' '}
                  <ArrowUpRight
                    aria-hidden='true'
                    focusable='false'
                    className='icon small'
                  />
                </a>
              </Button>
            </div>
            <div className='hosting-visual'>
              <div className='hosting-frame'>
                <div className='hosting-frame-title'>
                  <Server
                    aria-hidden='true'
                    focusable='false'
                    className='icon'
                  />
                  Your infrastructure
                </div>
                <div className='hosting-app'>
                  <img
                    src='/images/brand/mark-color.png'
                    alt=''
                    width='1254'
                    height='1254'
                  />
                  <strong>Preflyt</strong>
                  <span>Workspace · Policies · Evidence</span>
                </div>
                <div className='hosting-base'>
                  <span>GitHub integration</span>
                  <span>Organization access</span>
                </div>
              </div>
              <p>
                Docker Compose <span>·</span> Kubernetes application bundle
              </p>
            </div>
          </div>
        </section>

        <section className='faq-section container'>
          <div>
            <p className='section-label'>A few useful answers</p>
            <h2>
              Before you
              <br />
              get started.
            </h2>
            <a
              className='text-link'
              href='https://lyrisoft.github.io/preflyt/'
              target='_blank'
              rel='noreferrer'
            >
              Read the docs{' '}
              <ArrowUpRight
                aria-hidden='true'
                focusable='false'
                className='icon small'
              />
            </a>
          </div>
          <div className='faq-list'>
            <details>
              <summary>
                Do I need CI to see repository health?
                <ChevronDown
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </summary>
              <p>
                No. Selecting a repository queues an initial Health assessment.
                The report shows its analysis limits. Native scanner execution
                requires a qualified runtime, and inspection-only reports remain
                partial.
              </p>
            </details>
            <details>
              <summary>
                Does Preflyt replace my CI pipeline?
                <ChevronDown
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </summary>
              <p>
                Your pipeline continues to run tests and checks. Preflyt
                receives supported reports and evaluates the available evidence
                against your configured requirements.
              </p>
            </details>
            <details>
              <summary>
                Can AI approve or merge a pull request?
                <ChevronDown
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </summary>
              <p>
                No. AI explains findings and suggests fixes. It cannot waive
                checks or authorize a merge. GitHub applies your configured
                merge rules.
              </p>
            </details>
            <details>
              <summary>
                Can I use Preflyt without an AI provider?
                <ChevronDown
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </summary>
              <p>
                Yes. AI guidance is optional. Repository information, saved
                assessments and deterministic policy results remain independent
                of AI recommendations.
              </p>
            </details>
            <details>
              <summary>
                How do I get started?
                <ChevronDown
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </summary>
              <p>
                Follow the self-hosting guide, configure your installation and
                connect GitHub. Your organization manages sign-in and repository
                access.
              </p>
            </details>
          </div>
        </section>

        <section className='closing container'>
          <span className='closing-rule'></span>
          <h2>
            Give every change
            <br />
            <span>a clearer path forward.</span>
          </h2>
          <Button asChild>
            <a
              className='button'
              href='https://lyrisoft.github.io/preflyt/getting-started'
              target='_blank'
              rel='noreferrer'
            >
              Get started with Preflyt{' '}
              <ArrowUpRight
                aria-hidden='true'
                focusable='false'
                className='icon small'
              />
            </a>
          </Button>
        </section>
      </main>
    </MarketingLayout>
  )
}
