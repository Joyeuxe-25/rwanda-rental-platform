import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    server: {
      deps: {
        // `node:sqlite` is a newer Node built-in that Vite does not yet know to
        // externalize automatically; mark it external so it is required at
        // runtime instead of being bundled.
        external: ['node:sqlite'],
      },
    },
    // Coverage (B14). Measures the application source only — test helpers, the
    // Worker entry wrapper (`src/index.ts`), and pure type files carry no
    // meaningful runtime logic. Run with `npm run test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**'],
      reporter: ['text', 'json-summary'],
    },
  },
});
