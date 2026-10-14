import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Never discover tests in downloaded repository source or scanner scratch data.
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
})
