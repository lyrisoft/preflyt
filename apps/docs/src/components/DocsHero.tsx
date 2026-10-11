import Link from '@docusaurus/Link'

/** Landing header: what Preflyt is, and the two ways in. */
export default function DocsHero() {
  return (
    <div className='pf-hero'>
      <p className='pf-eyebrow'>Engineering assessment and governance</p>
      <h1 className='pf-hero__title'>Engineering confidence before production</h1>
      <p className='pf-hero__lead'>
        Preflyt is a self-hosted shift-left engineering platform for software
        teams. It brings engineering standards, branch policies, CI validation
        and optional AI code reviews into your GitHub delivery workflow.
      </p>
      <div className='pf-hero__actions'>
        <Link className='button button--primary' to='/getting-started/quick-start'>
          Quick Start
        </Link>
        <Link className='button button--secondary' to='/self-hosting/'>
          Self-host Preflyt
        </Link>
      </div>
    </div>
  )
}
