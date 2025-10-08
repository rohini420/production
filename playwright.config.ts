import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: process.env.STAGING_URL || 'http://localhost',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
