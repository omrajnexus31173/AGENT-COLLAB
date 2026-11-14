import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startOfflineProvider } from './offline-provider';

// These are real browser/API/worker/HTTP round trips against an explicit
// offline fixture. They are NOT evidence of live commercial-provider access.
let provider: Awaited<ReturnType<typeof startOfflineProvider>>;
test.beforeAll(async () => {
  provider = await startOfflineProvider();
});
test.afterAll(async () => {
  await provider.close();
});
test.beforeEach(() => {
  provider.state.mode = 'normal';
  provider.release();
});
test.afterEach(() => {
  provider.release();
});
const password = 'Nexus-workflow-test-2026';
async function setup(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Workflow Commander');
  await page
    .getByLabel('Email address')
    .fill(`workflow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/connections');
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByRole('button', { name: 'OpenAI-compatible', exact: true }).click();
  await page.getByLabel('Connection name').fill('Offline HTTP protocol endpoint');
  await page.getByLabel('API base URL').fill(provider.url);
  await page.getByLabel('API key', { exact: false }).fill('OFFLINE_HTTP_FIXTURE_KEY');
  await page.getByLabel('Default model', { exact: true }).fill('offline-http-fixture');
  await page.getByRole('button', { name: 'Save & verify', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.connection-card')).toContainText('verified');
  for (const name of ['Atlas', 'Aegis']) {
    await page.goto('/agents');
    await page.getByRole('button', { name: `Configure ${name}`, exact: true }).click();
    await page
      .getByLabel('Provider connection')
      .selectOption({ label: 'Offline HTTP protocol endpoint · verified' });
    await page.getByLabel('Output-token limit').selectOption('256');
    await page.getByRole('button', { name: 'Save agent', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
}
async function launch(page: Page, title: string, guided = false) {
  await page.goto('/missions/new');
  await page.getByLabel('Mission name').fill(title);
  await page
    .getByLabel('The brief', { exact: false })
    .fill(
      'Exercise persisted browser-to-worker collaboration using the explicitly offline HTTP protocol fixture.',
    );
  if (guided) await page.getByRole('button', { name: /Human-Guided/ }).click();
  await page.getByRole('button', { name: 'Launch mission', exact: true }).click();
  await expect(page).toHaveURL(/\/missions\/[a-f0-9-]+$/);
  await expect(page.getByText('Event stream live', { exact: true })).toBeVisible();
}
test('verified HTTP connection, guided execution, guidance, synthesis, exports, archive and network', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  await launch(page, 'Browser worker guided acceptance', true);
  await expect(page.getByRole('button', { name: 'Approve synthesis', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('tab', { name: /Transcript/ }).click();
  await expect(page.locator('.transcript')).toContainText('OFFLINE_HTTP_FIXTURE_OUTPUT');
  await page.getByRole('button', { name: 'Add guidance', exact: true }).click();
  await page.getByLabel('Your instruction').fill('Add an explicit verification-limitations checklist.');
  await page.getByLabel('Follow-up assignment').selectOption({ label: 'Add a task for Atlas' });
  await page.getByRole('button', { name: 'Send guidance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve synthesis', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Approve synthesis', exact: true }).click();
  await expect(
    page.getByText('The final deliverable and execution evidence are persisted.', { exact: false }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Read the result', exact: false }).click();
  await expect(page.locator('.mission-tab-content')).toContainText('OFFLINE_HTTP_FIXTURE_SYNTHESIS');
  await expect(page.locator('.mission-tab-content')).toContainText('Recorded execution evidence');
  await page.reload();
  await expect(page.locator('.mission-heading-meta .status')).toHaveText('completed');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.mission.status).toBe('completed');
  expect(exported.mission.tokens_reserved).toBe(0);
  expect(exported.output.content).toContain('OFFLINE_HTTP_FIXTURE_SYNTHESIS');
  expect(exported.tasks.some((t: { title: string }) => t.title === 'Human-directed follow-up')).toBe(true);
  expect(JSON.stringify(exported)).not.toContain('OFFLINE_HTTP_FIXTURE_KEY');
  await page.goto('/archive');
  await page.getByLabel('Search mission titles and briefs').fill('Browser worker guided');
  await page.getByRole('button', { name: 'Search missions', exact: true }).click();
  await expect(page.locator('.mission-table')).toContainText('Browser worker guided acceptance');
  await page.goto('/network');
  await expect(page.locator('.network-node.completed')).toHaveCount(2);
  await page.screenshot({ path: '.data/screenshots/workflow-network.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('pause aborts real HTTP calls, resume preserves work, and cancel never fabricates output', async ({
  page,
}) => {
  await setup(page);
  provider.state.mode = 'hold';
  await launch(page, 'Browser pause and resume');
  await expect.poll(() => provider.state.held).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.mission-heading-meta .status')).toHaveText('paused');
  provider.release();
  provider.state.mode = 'normal';
  await page.getByRole('button', { name: 'Resume mission', exact: true }).click();
  await expect(page.locator('.mission-heading-meta .status')).toHaveText('completed', { timeout: 30000 });
  provider.state.mode = 'hold';
  await launch(page, 'Browser cancellation');
  await expect.poll(() => provider.state.held).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel mission', exact: true }).click();
  await expect(page.locator('.mission-heading-meta .status')).toHaveText('cancelled');
  provider.release();
  await page.getByRole('tab', { name: /Final output/ }).click();
  await expect(page.getByRole('heading', { name: 'This mission was cancelled.' })).toBeVisible();
});
test('provider failure remains failed and password change revokes the other browser session', async ({
  page,
  browser,
}) => {
  await setup(page);
  provider.state.mode = 'fail';
  await launch(page, 'Browser honest failure');
  await expect(page.locator('.mission-heading-meta .status')).toHaveText('failed', { timeout: 30000 });
  await expect(page.locator('.notice-error')).toContainText('credentials or model permissions');
  await page.getByRole('tab', { name: /Final output/ }).click();
  await expect(page.getByRole('heading', { name: 'No final output was produced.' })).toBeVisible();
  const storage = await page.context().storageState();
  const other = await browser.newContext({ storageState: storage, baseURL: 'http://127.0.0.1:3100' });
  const second = await other.newPage();
  await second.goto('/dashboard');
  await expect(second.getByRole('heading', { name: 'Welcome to the nexus.' })).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill('Nexus-rotated-test-2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Nexus-rotated-test-2026');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Password updated. Other sessions were revoked.')).toBeVisible();
  await second.goto('/missions');
  await expect(second).toHaveURL(/\/login/);
  await other.close();
});
