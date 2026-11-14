import { test, expect, type Page } from '@playwright/test';
const password = 'Nexus-browser-test-2026';
const email = () => `browser-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
async function signup(page: Page, mail = email()) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Browser Commander');
  await page.getByLabel('Email address').fill(mail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Welcome to the nexus.' })).toBeVisible();
  return mail;
}
test('landing sections, local assets, interactive workflow, and reduced-motion fallback', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Infinite possibilities.');
  for (const id of ['platform', 'workflow', 'agents', 'missions', 'security'])
    await expect(page.locator(`#${id}`)).toBeAttached();
  // The client-only hero controls appear after hydration. Waiting for them
  // prevents clicking server-rendered tabs before their event handlers exist.
  await expect(page.getByRole('button', { name: 'Atlas', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Debate Arena', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good ideas survive a real challenge.' })).toBeVisible();
  await page.getByRole('button', { name: 'Oppose', exact: false }).click();
  await expect(page.locator('.workflow-step-detail')).toContainText('Challenge the reasoning');
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll('img')];
    images.forEach((img) => (img.loading = 'eager'));
    await Promise.all(images.map((img) => img.decode().catch(() => {})));
  });
  const broken = await page.locator('img').evaluateAll((images) =>
    images
      .filter((element) => {
        const img = element as HTMLImageElement;
        return !img.complete || img.naturalWidth === 0;
      })
      .map((img) => (img as HTMLImageElement).src),
  );
  expect(broken).toEqual([]);
  await expect(page.locator('.concept-label')).toContainText('STATIC CONCEPT');
  expect(errors).toEqual([]);
  // Full-page capture composites fixed elements at the current scroll offset.
  // Return to the top so the intentionally off-screen skip link stays outside it.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.data/screenshots/landing-desktop.png', fullPage: true });
});
test('real signup, refresh persistence, protected routes, profile, preferences, and logout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const mail = await signup(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to the nexus.' })).toBeVisible();
  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'Connection center', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Connection name').fill('Browser test endpoint');
  await page.getByLabel('API base URL').fill('https://api.openai.com/v1');
  await page.getByLabel('API key', { exact: false }).fill('OFFLINE_BROWSER_KEY_NOT_A_REAL_PROVIDER');
  await page.getByLabel('Default model', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: 'Save only', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser test endpoint' })).toBeVisible();
  await expect(page.locator('.connection-card').filter({ hasText: 'Browser test endpoint' })).toContainText(
    'unverified',
  );
  await page.goto('/agents');
  await expect(page.getByRole('heading', { name: 'Your agent roster' })).toBeVisible();
  await page.getByRole('button', { name: 'Configure Atlas', exact: true }).click();
  await page.getByLabel('Provider connection').selectOption({ label: 'Browser test endpoint · unverified' });
  await page.getByRole('button', { name: 'Save agent', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/missions/new');
  await page.getByLabel('Mission name').fill('Unverified browser mission');
  await page
    .getByLabel('The brief', { exact: false })
    .fill('This mission must remain disabled until a real provider verification succeeds.');
  await expect(page.getByRole('button', { name: 'Launch mission', exact: true })).toBeDisabled();
  await page.goto('/settings');
  await page.getByLabel('Default token budget').fill('40000');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Workspace preferences saved.')).toBeVisible();
  await page.goto('/profile');
  await page.getByLabel('Display name').fill('Updated Commander');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email address').fill(mail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter your workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: 'Updated Commander Personal account' })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.data/screenshots/dashboard-desktop.png', fullPage: true });
});
test('mobile landing and authenticated navigation remain usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('link', { name: 'The squad', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'The squad', exact: true }).click();
  await expect(page.locator('#agents')).toBeInViewport();
  await page.screenshot({ path: '.data/screenshots/landing-mobile.png', fullPage: true });
  await signup(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connection center', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/screenshots/connection-mobile.png' });
});
test('invalid credentials show an honest error and do not establish a session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('nonexistent@example.test');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Enter your workspace', exact: true }).click();
  await expect(page.locator('.notice-error[role="alert"]')).toContainText(
    'The email or password is incorrect.',
  );
  await page.goto('/missions');
  await expect(page).toHaveURL(/\/login/);
});
