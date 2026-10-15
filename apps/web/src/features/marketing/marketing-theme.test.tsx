import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { getCookie, removeCookie, setCookie } from '@/lib/cookies'
import { ThemeProvider } from '@/context/theme-provider'
import { MarketingLayout } from './marketing-layout'
import { WorkspaceWindow } from './workspace-window'

it.each(['light', 'system'] as const)(
  'keeps public previews dark for a %s workspace preference on a light system',
  async (preference) => {
    const storageKey = 'marketing-theme-test'
    const rootClasses = document.documentElement.className
    setCookie(storageKey, preference)
    vi.stubGlobal(
      'matchMedia',
      vi.fn((media: string) => ({
        media,
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"authenticated":false}'))
    )
    const view = await render(
      <ThemeProvider defaultTheme='light' storageKey={storageKey}>
        <MarketingLayout>
          <main id='main'>
            <WorkspaceWindow controls={false} />
          </main>
        </MarketingLayout>
      </ThemeProvider>
    )
    try {
      await expect
        .poll(() => document.documentElement.classList.contains('light'))
        .toBe(true)
      const site = document.querySelector<HTMLElement>('.marketing-site')!
      expect(site.dataset.theme).toBe('dark')
      expect(getComputedStyle(site).colorScheme).toBe('dark')
      expect(getComputedStyle(document.documentElement).colorScheme).toBe(
        'dark'
      )
      const canvas = site.querySelector<HTMLElement>(
        '.workspace-window-canvas'
      )!
      const sidebar = site.querySelector<HTMLElement>(
        '.workspace-window-sidebar'
      )!
      expect(getComputedStyle(sidebar).backgroundColor).toBe(
        getComputedStyle(canvas).backgroundColor
      )
      expect(getComputedStyle(sidebar).color).toBe(
        getComputedStyle(canvas).color
      )
      for (const [sidebarToken, baseToken] of [
        ['sidebar', 'background'],
        ['sidebar-foreground', 'foreground'],
        ['sidebar-primary', 'primary'],
        ['sidebar-primary-foreground', 'primary-foreground'],
        ['sidebar-accent', 'accent'],
        ['sidebar-accent-foreground', 'accent-foreground'],
        ['sidebar-border', 'border'],
        ['sidebar-ring', 'ring'],
      ]) {
        expect(
          getComputedStyle(sidebar).getPropertyValue(`--${sidebarToken}`)
        ).toBe(getComputedStyle(canvas).getPropertyValue(`--${baseToken}`))
      }
      expect(site.querySelector('.theme-toggle')).toBeNull()
      expect(site.querySelector('button[aria-label*="theme"]')).toBeNull()
      expect(getCookie(storageKey)).toBe(preference)
    } finally {
      await view.unmount()
      removeCookie(storageKey)
      document.documentElement.className = rootClasses
      vi.unstubAllGlobals()
    }
  }
)
