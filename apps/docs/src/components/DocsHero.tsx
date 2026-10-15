import useBaseUrl from '@docusaurus/useBaseUrl'
import Link from '@docusaurus/Link'

/** Landing header: what Preflyt is, and the two ways in. */
export default function DocsHero() {
  return (
    <div className='pf-hero'>
      <img
        className='pf-brand-logo'
        src={useBaseUrl('img/brand/logo-panel.svg')}
        alt='PreflytLabs'
        width={840}
        height={280}
      />
      <p className='pf-eyebrow'>
        Engineering Assurance &amp; Readiness Platform
      </p>
      <h1 className='pf-hero__title'>
        Every change. Verified against your standards.
      </h1>
      <p className='pf-hero__lead'>
        Assess repository health and verify CI evidence against approved
        engineering standards. Get traceable readiness results and advisory AI
        guidance in one self-hosted workspace.
      </p>
      <div className='pf-release-badges' aria-label='Published releases'>
        {/* Preflyt is private: update its verified release badge when publishing. */}
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
      <div className='pf-hero__actions'>
        <Link
          className='button button--primary'
          to='/getting-started/quick-start'
        >
          Quick Start
        </Link>
        <Link className='button button--secondary' to='/self-hosting/'>
          Self-host Preflyt
        </Link>
      </div>
    </div>
  )
}
