import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

// GitHub Pages serves project sites under /<repository>/. Override both values
// when the site moves to a custom domain (DOCS_BASE_URL=/).
const url = process.env.DOCS_URL ?? 'https://lyrisoft.github.io'
const baseUrl = process.env.DOCS_BASE_URL ?? '/preflyt/'
const repository = 'https://github.com/lyrisoft/preflyt'

const config: Config = {
  title: 'Preflyt',
  tagline: 'Engineering confidence before production',
  favicon: 'img/brand/favicon.svg',
  url,
  baseUrl,
  organizationName: 'lyrisoft',
  projectName: 'preflyt',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    mermaid: true,
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  // Same type families as the Preflyt app.
  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&family=JetBrains+Mono:wght@400;500&display=swap',
      type: 'text/css',
    },
  ],
  headTags: [
    { tagName: 'link', attributes: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
    {
      tagName: 'link',
      attributes: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    },
  ],
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `${repository}/edit/development/apps/docs/`,
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Preflyt',
      logo: { alt: 'Preflyt', src: 'img/brand/mark-white.png', srcDark: 'img/brand/mark-color.png' },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'gettingStarted',
          position: 'left',
          label: 'Getting Started',
        },
        {
          type: 'docSidebar',
          sidebarId: 'userGuide',
          position: 'left',
          label: 'User Guide',
        },
        {
          type: 'docSidebar',
          sidebarId: 'selfHosting',
          position: 'left',
          label: 'Self-Hosting',
        },
        {
          type: 'docSidebar',
          sidebarId: 'concepts',
          position: 'left',
          label: 'Concepts',
        },
        { href: `pathname://${baseUrl}llms.txt`, label: 'llms.txt', position: 'right' },
        { href: repository, label: 'GitHub', position: 'right' },
      ],
    },
    docs: { sidebar: { hideable: true } },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Start',
          items: [
            { label: 'Quick Start', to: '/getting-started/quick-start' },
            { label: 'Connect GitHub', to: '/getting-started/connect-github' },
            { label: 'First assessment', to: '/getting-started/first-assessment' },
          ],
        },
        {
          title: 'Operate',
          items: [
            { label: 'Docker Compose', to: '/self-hosting/docker-compose' },
            { label: 'Configuration', to: '/self-hosting/configuration' },
            { label: 'Troubleshooting', to: '/self-hosting/troubleshooting' },
          ],
        },
        {
          title: 'Understand',
          items: [
            { label: 'How Preflyt works', to: '/concepts/how-preflyt-works' },
            { label: 'Evidence and trust', to: '/concepts/evidence-and-trust' },
            { label: 'GitHub', href: repository },
          ],
        },
      ],
      copyright: `Preflyt is developed by Lyrisoft Technologies. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'docker'],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
