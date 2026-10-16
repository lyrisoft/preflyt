import { ArrowRight, ArrowUpRight, Check, Cloud, Server } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { MarketingLayout } from './marketing-layout'
import './pricing.css'
import { PageMetadata } from './public-page-metadata'

const installGuide = 'https://docs.preflytlabs.com/getting-started/quick-start'
const cloudContact =
  'mailto:support@lyrisoft.tech?subject=Preflyt%20Cloud%20enquiry'
const communityFeatures = [
  'Repository Health with the bundled scanner',
  'Findings, source context and assessment history',
  'Versioned standards and verified CI evidence',
  'GitHub merge protection with explicit activation',
  'Contributor activity, access controls and audit history',
  'Optional AI with your own provider',
]
const faqs = [
  {
    question: 'Is Community Edition free?',
    answer:
      'Yes. Preflyt Community Edition has no software license fee and is licensed under Apache-2.0. You cover your infrastructure, CI and any optional AI provider costs.',
  },
  {
    question: 'Can I install Community Edition today?',
    answer:
      'Yes, with access to the release images. Follow the Community install guide to run Preflyt locally or on your infrastructure. Public source and image access is still in preparation; contact us if you need release access.',
  },
  {
    question: 'Is there a repository limit?',
    answer:
      'Community Edition has no artificial repository cap. The number of repositories and concurrent assessments you can run depends on your infrastructure and connected services.',
  },
  {
    question: 'Do I need a paid AI provider?',
    answer:
      'No. Repository Health and deterministic CI checks work without AI. If you enable advisory AI features, connect your own provider and pay any provider usage charges directly.',
  },
]

export function PricingPage() {
  return (
    <MarketingLayout activeSection='pricing'>
      <PageMetadata path='/pricing' />
      <main id='main' className='pricing-page'>
        <section className='pricing-intro container'>
          <p className='eyebrow'>Pricing</p>
          <h1>
            Start with open source.
            <br />
            Run it your way.
          </h1>
          <p>
            Self-host today with Community Edition. A managed Cloud option is
            coming soon.
          </p>
        </section>
        <section className='pricing-plans container' aria-label='Preflyt plans'>
          <article
            className='pricing-plan pricing-community'
            aria-labelledby='community-plan'
          >
            <div className='pricing-plan-heading'>
              <Server className='icon' aria-hidden='true' />
              <h2 id='community-plan'>Community Edition</h2>
              <StatusBadge tone='success'>Available now</StatusBadge>
            </div>
            <p className='pricing-plan-description'>
              For teams that want control of their deployment.
            </p>
            <div className='pricing-price'>
              <strong>Open source</strong>
              <span>No software license fee · Apache-2.0</span>
            </div>
            <a className='button pricing-plan-action' href={installGuide}>
              Install Community Edition
              <ArrowUpRight className='icon small' aria-hidden='true' />
            </a>
            <p className='pricing-plan-caption'>
              Self-hosted on your infrastructure.
            </p>
            <div className='pricing-features'>
              <h3>Included in Community Edition</h3>
              <ul>
                {communityFeatures.map((feature) => (
                  <li key={feature}>
                    <Check aria-hidden='true' />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className='pricing-plan-footnote'>
              No repository cap. Capacity depends on your infrastructure.
            </p>
          </article>
          <article
            className='pricing-plan pricing-cloud'
            aria-labelledby='cloud-plan'
          >
            <div className='pricing-plan-heading'>
              <Cloud className='icon' aria-hidden='true' />
              <h2 id='cloud-plan'>Cloud</h2>
              <StatusBadge tone='neutral'>Coming soon</StatusBadge>
            </div>
            <p className='pricing-plan-description'>
              A fully managed Preflyt experience, operated by our team.
            </p>
            <a
              className='button pricing-plan-action pricing-secondary'
              href={cloudContact}
            >
              Contact us for updates
              <ArrowUpRight className='icon small' aria-hidden='true' />
            </a>
          </article>
        </section>
        <p className='pricing-access-note container'>
          Community Edition source and release images currently require access
          while public release preparation is completed.{' '}
          <a href='mailto:support@lyrisoft.tech?subject=Preflyt%20Community%20release%20access'>
            Ask about release access
            <ArrowUpRight className='icon small' aria-hidden='true' />
          </a>
        </p>
        <section
          className='pricing-costs container'
          aria-labelledby='community-costs'
        >
          <div>
            <p className='section-label'>A clear operating model</p>
            <h2 id='community-costs'>
              Open-source software.
              <br />
              Infrastructure you control.
            </h2>
            <a className='text-link' href='/self-hosting'>
              Explore self-hosting
              <ArrowRight className='icon small' aria-hidden='true' />
            </a>
          </div>
          <dl>
            <div>
              <dt>Run it on your terms</dt>
              <dd>
                Community includes the engineering workflow. Your team manages
                hosting, storage, upgrades and backups.
              </dd>
            </div>
            <div>
              <dt>Use your existing CI</dt>
              <dd>
                Connect reports with the Preflyt Action. Your CI provider’s
                usage charges remain separate.
              </dd>
            </div>
            <div>
              <dt>Choose whether to use AI</dt>
              <dd>
                Core checks work without a paid model. Optional AI uses your own
                provider credentials.
              </dd>
            </div>
          </dl>
        </section>
        <section className='faq-section container'>
          <div>
            <p className='section-label'>Questions, answered</p>
            <h2>Before you choose.</h2>
            <a className='text-link' href='mailto:support@lyrisoft.tech'>
              Contact us
              <ArrowUpRight className='icon small' aria-hidden='true' />
            </a>
          </div>
          <div className='faq-list'>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <ArrowRight className='icon small' aria-hidden='true' />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </MarketingLayout>
  )
}
