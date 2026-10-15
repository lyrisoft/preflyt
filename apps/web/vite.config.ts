/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { playwright } from '@vitest/browser-playwright'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
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
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
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
})
