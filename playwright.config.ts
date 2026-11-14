import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'workspace.spec.ts',
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.data/playwright-report' }]],
  outputDir: '.data/playwright-results',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      // Lambda's convenience flags disable web security and omit Origin headers.
      // Keep browser security enabled so these tests exercise the real CSRF boundary.
      args: chromium.args.filter(
        (arg) =>
          ![
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--single-process',
            '--disable-site-isolation-trials',
          ].includes(arg) && !arg.startsWith('--disable-features='),
      ),
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
