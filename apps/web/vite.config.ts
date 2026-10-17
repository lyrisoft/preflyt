/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const value =
    process.env.VITE_WEBSITE_MODE ?? env.VITE_WEBSITE_MODE ?? 'false'
  if (!['true', 'false'].includes(value))
    throw new Error('VITE_WEBSITE_MODE must be true or false')
  const websiteMode = value === 'true'
  return {
    plugins: [
      ...(!websiteMode
        ? [
            tanstackRouter({
              target: 'react',
              autoCodeSplitting: true,
            }),
          ]
        : []),
      ...(websiteMode
        ? [
            {
              name: 'preflyt-website-entry',
              transformIndexHtml: {
                order: 'pre' as const,
                handler: (html: string) =>
                  html.replace('/src/main.tsx', '/src/main.website.tsx'),
              },
            },
          ]
        : []),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@/public-router': path.resolve(
          import.meta.dirname,
          websiteMode ? './src/website-router.tsx' : './src/public-router.ts'
        ),
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      proxy: websiteMode
        ? undefined
        : {
            '/api': {
              target: 'http://localhost:3000',
              changeOrigin: false,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
    },
    optimizeDeps: {
      include: [
        '@radix-ui/react-switch',
        '@tanstack/react-query',
        '@radix-ui/react-direction',
        '@tanstack/react-query-devtools',
        '@tanstack/react-router-devtools',
        '@tanstack/react-router/ssr/client',
        'react-dom/client',
        'react-top-loading-bar',
      ],
    },
    test: {
      // Keep focus, viewport and animated overlay interactions deterministic under CI load.
      fileParallelism: false,
      silent: 'passed-only',
      unstubEnvs: true,
      browser: {
        enabled: true,
        provider: playwright({
          contextOptions: {
            hasTouch: process.env.PREFLYT_TEST_TOUCH === 'true',
            reducedMotion:
              process.env.PREFLYT_TEST_REDUCED_MOTION === 'true'
                ? 'reduce'
                : 'no-preference',
            ...(process.env.PREFLYT_TEST_TIMEZONE
              ? { timezoneId: process.env.PREFLYT_TEST_TIMEZONE }
              : {}),
          },
        }),
        instances: [{ browser: 'chromium' }],
        commands: {
          setDesignMotion: defineBrowserCommand(
            async ({ page }, value: 'reduce' | 'no-preference') => {
              await page.emulateMedia({ reducedMotion: value })
            }
          ),
        },
      },
      coverage: {
        enabled: process.env.PREFLYT_COLLECT_COVERAGE === 'true',
        provider: 'v8',
        include: ['src/**/*.{js,jsx,ts,tsx}'],
        reporter: ['lcovonly', 'text-summary'],
        reportsDirectory: './coverage',
        exclude: [
          '**/*.{test,spec}.{js,jsx,ts,tsx}',
          'src/components/ui/**',
          'src/assets/**',
          'src/routeTree.gen.ts',
          'src/test-utils/**',
          'src/routes/**',
        ],
      },
    },
  }
})
