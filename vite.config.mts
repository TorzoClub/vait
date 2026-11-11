/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'vait.esm.js' : 'vait.common.js',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    clearMocks: false,
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov', 'json'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: -10,
      },
    },
  },
})
