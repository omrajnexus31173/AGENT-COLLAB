import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: 'workflow.spec.ts',
  timeout: 90000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.data/playwright-workflow-report' }]],
  outputDir: '.data/playwright-workflow-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'node scripts/workflow-server.mjs',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    timeout: 90000,
  },
});
