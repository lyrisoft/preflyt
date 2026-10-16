import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import './homepage.css'
import { useHomepageMotion } from './use-homepage-motion'

const footerGroups = [
  {
    title: 'Product',
    links: [
      ['Product overview', '/product'],
      ['Pricing', '/pricing'],
      ['Repository health', '/product/repository-health'],
      ['Standards & evidence', '/product/standards-and-evidence'],
      ['Merge Protection', '/product/merge-protection'],
      ['How it works', '/#how-it-works'],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['Documentation', 'https://docs.preflytlabs.com/'],
      [
        'Community install guide',
        'https://docs.preflytlabs.com/getting-started/quick-start',
      ],
      ['Deployment & operations', 'https://docs.preflytlabs.com/self-hosting'],
      ['Preflyt Action', 'https://github.com/lyrisoft/preflyt-action'],
    ],
  },
  {
    title: 'Community',
    links: [
      ['Community Edition', '/self-hosting'],
      ['GitHub', 'https://github.com/lyrisoft/preflyt'],
      [
        'Contributing',
        'https://github.com/lyrisoft/preflyt/blob/main/CONTRIBUTING.md',
      ],
      [
        'Security policy',
        'https://github.com/lyrisoft/preflyt/blob/main/SECURITY.md',
      ],
    ],
  },
] as const

export function MarketingClosing({
  title = 'Give every change a clearer path forward.',
}: {
  title?: string
}) {
  return (
    <section className='closing container'>
      <div>
        <h2>{title}</h2>
        <p>
          Start with repository health. Add standards and CI when your team is
          ready.
        </p>
      </div>
      <a
        className='button'
        href='https://docs.preflytlabs.com/getting-started/quick-start'
      >
        Community install guide{' '}
        <ArrowUpRight className='icon small' aria-hidden='true' />
      </a>
    </section>
  )
}

export function MarketingLayout({
  children,
  activeSection,
}: {
  children: ReactNode
  activeSection?: 'product' | 'community' | 'pricing'
}) {
  const siteRef = useRef<HTMLDivElement>(null)
  useHomepageMotion(siteRef)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (import.meta.env.VITE_WEBSITE_MODE === 'true') return
    const controller = new AbortController()
    void fetch(`${API_BASE_URL}/auth/session`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((session) => setAuthenticated(session?.authenticated === true))
      .catch(() => {})
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuRef.current?.focus()
      }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])
  return (
    <div ref={siteRef} className='marketing-site dark' data-theme='dark'>
      <link
        rel='stylesheet'
        href={
          'https://fonts.googleapis.com/css2?family=Geist:wght@300;350;400;450;500;600;650;700&display=swap'
        }
      />
      <a className='skip' href='#main'>
        Skip to content
      </a>
      <header className='header'>
        <div className='nav-row container'>
          <a className='brand' href='/' aria-label='Preflyt home'>
            <img
              className='brand-light'
              src='/images/brand/logo-white.png'
              alt='PreflytLabs'
              width='2172'
              height='724'
            />
          </a>
          <nav className='desktop-nav' aria-label='Main navigation'>
            <a
              href='/product'
              aria-current={activeSection === 'product' ? 'true' : undefined}
            >
              Product
            </a>
            <a href='/#how-it-works'>How it works</a>
            <a
              href='/self-hosting'
              aria-current={activeSection === 'community' ? 'true' : undefined}
            >
              Community Edition
            </a>
            <a
              href='/pricing'
              aria-current={activeSection === 'pricing' ? 'page' : undefined}
            >
              Pricing
            </a>
            <a
              href='https://docs.preflytlabs.com/'
              target='_blank'
              rel='noreferrer'
            >
              Docs{' '}
              <ArrowUpRight
                aria-hidden='true'
                focusable='false'
                className='icon small'
              />
            </a>
          </nav>
          <div className='nav-actions'>
            {import.meta.env.VITE_WEBSITE_MODE !== 'true' && (
              <a
                className='sign-in'
                href={authenticated ? '/overview' : '/sign-in'}
              >
                {authenticated ? 'Open workspace' : 'Sign in'}
              </a>
            )}
            <Button asChild>
              <a
                className='button compact'
                href='https://docs.preflytlabs.com/getting-started/quick-start'
                target='_blank'
                rel='noreferrer'
              >
                Install guide{' '}
                <ArrowUpRight
                  aria-hidden='true'
                  focusable='false'
                  className='icon small'
                />
              </a>
            </Button>
            <button
              className='menu-button'
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              ref={menuRef}
              aria-controls='mobile-nav'
            >
              {menuOpen ? (
                <X aria-hidden='true' className='icon' />
              ) : (
                <Menu aria-hidden='true' className='icon' />
              )}
            </button>
          </div>
        </div>
        <nav
          className='mobile-nav container'
          id='mobile-nav'
          aria-label='Mobile navigation'
          hidden={!menuOpen}
          onClick={() => setMenuOpen(false)}
        >
          <a
            href='/product'
            aria-current={activeSection === 'product' ? 'true' : undefined}
          >
            Product
          </a>
          <a href='/#how-it-works'>How it works</a>
          <a
            href='/self-hosting'
            aria-current={activeSection === 'community' ? 'true' : undefined}
          >
            Community Edition
          </a>
          <a
            href='/pricing'
            aria-current={activeSection === 'pricing' ? 'page' : undefined}
          >
            Pricing
          </a>
          <a
            href='https://docs.preflytlabs.com/'
            target='_blank'
            rel='noreferrer'
          >
            Documentation
          </a>
          {import.meta.env.VITE_WEBSITE_MODE !== 'true' && (
            <a href={authenticated ? '/overview' : '/sign-in'}>
              {authenticated ? 'Open workspace' : 'Sign in'}{' '}
              <ArrowUpRight
                aria-hidden='true'
                focusable='false'
                className='icon'
              />
            </a>
          )}
        </nav>
      </header>
      {children}
      <footer className='footer'>
        <div className='container'>
          <div className='footer-top'>
            <div className='footer-identity'>
              <a className='brand' href='/' aria-label='Preflyt home'>
                <img
                  className='brand-light'
                  src='/images/brand/logo-white.png'
                  alt='PreflytLabs'
                  width='2172'
                  height='724'
                />
              </a>
              <p>
                Engineering confidence
                <br />
                before production.
              </p>
              {import.meta.env.VITE_WEBSITE_MODE !== 'true' && (
                <a
                  className='text-link'
                  href={authenticated ? '/overview' : '/sign-in'}
                >
                  {authenticated ? 'Open workspace' : 'Sign in'}
                  <ArrowUpRight className='icon small' aria-hidden='true' />
                </a>
              )}
            </div>
            <nav className='footer-navigation' aria-label='Footer navigation'>
              {footerGroups.map((group) => (
                <div key={group.title}>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.links.map(([label, href]) => (
                      <li key={label}>
                        <a href={href}>{label}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          <div className='footer-bottom'>
            <span>© 2026 Lyrisoft Technologies</span>
            <div className='footer-meta'>
              <a href='https://www.apache.org/licenses/LICENSE-2.0'>
                Apache-2.0 license
              </a>
              <a href='mailto:support@lyrisoft.tech'>Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
