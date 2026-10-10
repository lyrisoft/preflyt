import Link from '@docusaurus/Link'

/** Landing header: what Preflyt is, and the two ways in. */
export default function DocsHero() {
  return (
    <div className='pf-hero'>
      <p className='pf-eyebrow'>Self-hosted Shift Left platform</p>
      <h1 className='pf-hero__title'>Engineering confidence before production</h1>
      <p className='pf-hero__lead'>
        Preflyt shows which engineering checks apply to each repository,
        whether the evidence for them can be trusted, and where the gaps are,
        at an exact commit.
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
