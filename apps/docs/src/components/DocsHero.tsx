import {useInstallationVersion} from './InstallationVersion'
import Link from '@docusaurus/Link'

/** Landing header: what Preflyt is, and the two ways in. */
export default function DocsHero() {
  const {next, prefix, imageTag} = useInstallationVersion()
  return (
    <div className='pf-hero'>
      <p className='pf-eyebrow'>Engineering assurance for GitHub</p>
      <h1 className='pf-hero__title'>
        Know what passed. See what needs attention.
      </h1>
      <p className='pf-hero__lead'>
        Bring repository health, engineering standards and verified CI results
        into one self-hosted workspace. Understand the evidence behind every
        assessment.
      </p>
      <div className='pf-hero__actions'>
        <Link
          className='button button--primary'
          to={`${prefix}/getting-started/quick-start`}
        >
          Quick Start
        </Link>
        <Link className='button button--secondary' to={`${prefix}/self-hosting/`}>
          Self-host Preflyt
        </Link>
      </div>
      <div className='pf-hero__release'>
        <div
          className='pf-release-badges'
          aria-label='Releases and Community license'
        >
          {/* Documentation identity follows the selected version, not GitHub's latest release. */}
          <a
            href={next ? 'https://github.com/lyrisoft/preflyt/tree/development' : `https://github.com/lyrisoft/preflyt/releases/tag/${imageTag}`}
            aria-label={next ? 'Preflyt Next documentation' : `Preflyt ${imageTag} release`}
          >
            <img
              src={`https://img.shields.io/badge/Preflyt-${next ? 'Next' : imageTag}-2f6f60?logo=github`}
              alt={`Preflyt ${next ? 'Next (unreleased)' : imageTag}`}
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
        <p>
          Community Edition is open source under Apache-2.0. Self-host with public
          container images. Managed Cloud is coming soon.
        </p>
      </div>
    </div>
  )
}
