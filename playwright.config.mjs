import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8123',
    // SW bi presretao zahtjeve prije page.route; SW se testira posebno.
    serviceWorkers: 'block',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://localhost:8123',
    reuseExistingServer: !process.env.CI,
  },
});
