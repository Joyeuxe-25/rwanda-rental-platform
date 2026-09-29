import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(frontendRoot, '..', 'backend');
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const apiURL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -- --local',
      cwd: backendRoot,
      url: `${apiURL}/api/v1/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
      cwd: frontendRoot,
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: `${apiURL}/api/v1`,
      },
    },
  ],
});
