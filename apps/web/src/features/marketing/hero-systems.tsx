import {
  ArrowDown,
  BookOpen,
  Database,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  LockKeyhole,
  ScanLine,
  Server,
} from 'lucide-react'
import './hero-systems.css'

/** Product relationships, not live assessment results or deployment status. */
export function ProductHeroSystem() {
  return (
    <figure
      className='hero-system product-system'
      aria-label='How Preflyt connects repository and CI evidence'
    >
      <div className='system-context'>
        <GitCommitHorizontal aria-hidden='true' />
        <div>
          <span className='system-label'>Shared revision context</span>
          <strong>Repository · branch · commit</strong>
        </div>
      </div>
      <div className='system-fork' aria-hidden='true'>
        <span />
        <span />
      </div>
      <div className='system-paths'>
        <section className='system-path'>
          <header>
            <GitBranch aria-hidden='true' />
            <h2>Repository health</h2>
          </header>
          <p className='system-path-intro'>Understand the codebase</p>
          <ul>
            <li>Security &amp; quality scans</li>
            <li>Findings at the source</li>
            <li>Analysis scope &amp; limits</li>
          </ul>
          <div className='system-output'>
            <ArrowDown aria-hidden='true' />
            <strong>Health report</strong>
            <span>Risks and source context</span>
          </div>
        </section>
        <section className='system-path'>
          <header>
            <BookOpen aria-hidden='true' />
            <h2>Standards &amp; CI</h2>
          </header>
          <p className='system-path-intro'>Verify your requirements</p>
          <ul>
            <li>Published branch policy</li>
            <li>Verified CI reports</li>
            <li>Required check outcomes</li>
          </ul>
          <div className='system-output'>
            <ArrowDown aria-hidden='true' />
            <strong>Merge review result</strong>
            <span>Passed, failed or incomplete</span>
          </div>
        </section>
      </div>
      <figcaption>
        <GitPullRequest aria-hidden='true' />
        <span>GitHub enforces your configured merge rules.</span>
      </figcaption>
    </figure>
  )
}

export function HostingHeroSystem() {
  return (
    <figure
      className='hero-system hosting-system'
      aria-label='Preflyt self-hosted deployment architecture'
    >
      <div className='system-external'>
        <GitBranch aria-hidden='true' />
        <span>GitHub</span>
        <span className='system-external-divider' />
        <GitPullRequest aria-hidden='true' />
        <span>Your CI</span>
      </div>
      <div className='system-connection'>
        <span />
        <span className='system-connection-label'>HTTPS</span>
        <span />
      </div>
      <div className='hosting-boundary'>
        <header className='hosting-boundary-heading'>
          <Server aria-hidden='true' />
          <strong>Your infrastructure</strong>
        </header>
        <div className='hosting-entry'>
          <LockKeyhole aria-hidden='true' />
          <span>Your reverse proxy</span>
        </div>
        <div className='hosting-connector' aria-hidden='true' />
        <div className='hosting-application'>
          <div className='hosting-tier-heading'>
            <strong>Preflyt</strong>
            <span>Application services</span>
          </div>
          <ul className='hosting-services' aria-label='Application services'>
            <li>Web</li>
            <li>API</li>
            <li>Worker</li>
          </ul>
          <div className='hosting-scanner'>
            <ScanLine aria-hidden='true' />
            <span>Bundled Health scanner</span>
          </div>
        </div>
        <div className='hosting-connector' aria-hidden='true' />
        <div className='hosting-storage'>
          <div>
            <Database aria-hidden='true' />
            <strong>PostgreSQL</strong>
            <span>Saved data</span>
          </div>
          <div>
            <Layers aria-hidden='true' />
            <strong>Valkey</strong>
            <span>Job queue</span>
          </div>
        </div>
      </div>
      <figcaption>Optional AI connects to your chosen provider.</figcaption>
    </figure>
  )
}
