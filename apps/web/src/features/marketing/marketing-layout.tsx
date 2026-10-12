import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, Menu, Sun } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { useTheme } from '@/context/theme-provider'
import { Button } from '@/components/ui/button'
import './homepage.css'
import { useHomepageMotion } from './use-homepage-motion'

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { resolvedTheme, setTheme } = useTheme()
  const siteRef = useRef<HTMLDivElement>(null)
  useHomepageMotion(siteRef)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
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
    <div ref={siteRef} className='marketing-site' data-theme={resolvedTheme}>
      <link
        rel='stylesheet'
        href='https://fonts.googleapis.com/css2?family=Geist:wght@300;350;400;450;500;600;650;700&display=swap'
      />
      <a className='skip' href='#main'>
        Skip to content
      </a>
      <header className='header'>
        <div className='nav-row container'>
          <a className='brand' href='/' aria-label='Preflyt home'>
            <img
              className='brand-dark'
              src='/images/brand/logo-color.png'
              alt='PreflytLabs'
              width='2172'
              height='724'
            />
            <img
              className='brand-light'
              src='/images/brand/logo-white.png'
              alt='PreflytLabs'
              width='2172'
              height='724'
            />
          </a>
          <nav className='desktop-nav' aria-label='Main navigation'>
            <a href='/product'>Product</a>
            <a href='/#how-it-works'>How it works</a>
            <a href='/self-hosting'>Self-hosting</a>
            <a
              href='https://lyrisoft.github.io/preflyt/'
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
            <a
              className='sign-in'
              href={authenticated ? '/overview' : '/sign-in'}
            >
              {authenticated ? 'Open workspace' : 'Sign in'}
            </a>
            <Button asChild>
              <a
                className='button compact'
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
            <button
              className='menu-button'
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              ref={menuRef}
              aria-controls='mobile-nav'
            >
              <Menu aria-hidden='true' focusable='false' className='icon' />
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
          <a href='/product'>Product</a>
          <a href='/#how-it-works'>How it works</a>
          <a href='/self-hosting'>Self-hosting</a>
          <a
            href='https://lyrisoft.github.io/preflyt/'
            target='_blank'
            rel='noreferrer'
          >
            Documentation
          </a>
          <a href={authenticated ? '/overview' : '/sign-in'}>
            {authenticated ? 'Open workspace' : 'Sign in'}{' '}
            <ArrowUpRight
              aria-hidden='true'
              focusable='false'
              className='icon'
            />
          </a>
        </nav>
      </header>
      {children}
      <footer className='footer container'>
        <div className='footer-top'>
          <div>
            <a className='brand' href='/' aria-label='Preflyt home'>
              <img
                className='brand-dark'
                src='/images/brand/logo-color.png'
                alt='PreflytLabs'
                width='2172'
                height='724'
              />
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
          </div>
          <div>
            <h3>Explore</h3>
            <a href='/product/repository-health'>Repository health</a>
            <a href='/product/standards-and-evidence'>
              Standards &amp; evidence
            </a>
            <a href='/product/merge-protection'>Merge Protection</a>
            <a href='/product'>Product</a>
            <a href='/#how-it-works'>How it works</a>
            <a href='/self-hosting'>Self-hosting</a>
          </div>
          <div>
            <h3>Build</h3>
            <a
              href='https://lyrisoft.github.io/preflyt/'
              target='_blank'
              rel='noreferrer'
            >
              Documentation
            </a>
            <a
              href='https://github.com/lyrisoft/preflyt'
              target='_blank'
              rel='noreferrer'
            >
              GitHub
            </a>
            <a
              href='https://github.com/lyrisoft/preflyt-action'
              target='_blank'
              rel='noreferrer'
            >
              Preflyt Action
            </a>
          </div>
          <div>
            <h3>Your workspace</h3>
            <a href={authenticated ? '/overview' : '/sign-in'}>
              {authenticated ? 'Open workspace' : 'Sign in'}
            </a>
            <a
              href='https://lyrisoft.github.io/preflyt/getting-started'
              target='_blank'
              rel='noreferrer'
            >
              Get started
            </a>
            <button
              className='theme-toggle'
              type='button'
              onClick={() =>
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }
              aria-label={
                resolvedTheme === 'dark'
                  ? 'Switch to light theme'
                  : 'Switch to dark theme'
              }
            >
              <Sun
                aria-hidden='true'
                focusable='false'
                className='icon small'
              />
              <span>
                {resolvedTheme === 'dark'
                  ? 'Light appearance'
                  : 'Dark appearance'}
              </span>
            </button>
          </div>
        </div>
        <div className='footer-bottom'>
          <span>© 2026 Lyrisoft Technologies</span>
          <span>Built for the work before production.</span>
        </div>
      </footer>
    </div>
  )
}
